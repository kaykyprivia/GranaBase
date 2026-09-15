-- Negocio V2 #11 — Fluxo de Caixa
-- Camada 1: financeiro das compras.
-- Estado operacional da compra continua separado do estado financeiro.

alter table public.business_purchase_orders
  add column if not exists payment_status text not null default 'PENDING';

alter table public.business_purchase_orders
  drop constraint if exists business_purchase_orders_payment_status_check;

alter table public.business_purchase_orders
  add constraint business_purchase_orders_payment_status_check
  check (
    payment_status in (
      'PENDING',
      'PARTIALLY_PAID',
      'PAID',
      'REFUNDED'
    )
  );

create table if not exists public.business_purchase_payments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  workspace_id      uuid not null,
  purchase_order_id uuid not null,
  amount            numeric(12,2) not null check (amount > 0),
  payment_method    text,
  status            text not null check (status in ('PAID', 'REFUNDED')),
  paid_at           timestamptz not null default now(),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (id, user_id),
  unique (id, user_id, workspace_id),

  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id)
    on delete cascade,

  foreign key (purchase_order_id, user_id, workspace_id)
    references public.business_purchase_orders(id, user_id, workspace_id)
    on delete cascade
);

create index if not exists idx_business_purchase_payments_workspace_paid_at
  on public.business_purchase_payments (
    workspace_id,
    paid_at desc
  );

create index if not exists idx_business_purchase_payments_purchase
  on public.business_purchase_payments (
    purchase_order_id,
    paid_at desc
  );

alter table public.business_purchase_payments
  enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'business_purchase_payments'
      and policyname = 'users can select own business_purchase_payments'
  ) then
    create policy "users can select own business_purchase_payments"
      on public.business_purchase_payments
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_business_purchase_payments_updated_at'
      and tgrelid = 'public.business_purchase_payments'::regclass
  ) then
    create trigger set_business_purchase_payments_updated_at
      before update on public.business_purchase_payments
      for each row
      execute procedure public.set_updated_at();
  end if;
end
$$;

create or replace function public.business_refresh_purchase_payment_status(
  p_purchase_order_id uuid,
  p_user_id uuid,
  p_workspace_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  purchase_total numeric(12,2);
  paid_total numeric(12,2);
  refunded_total numeric(12,2);
  net_paid numeric(12,2);
  next_status text;
begin
  select total_cost
    into purchase_total
  from public.business_purchase_orders
  where id = p_purchase_order_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Compra nao encontrada';
  end if;

  select
    coalesce(sum(amount) filter (where status = 'PAID'), 0),
    coalesce(sum(amount) filter (where status = 'REFUNDED'), 0)
    into paid_total, refunded_total
  from public.business_purchase_payments
  where purchase_order_id = p_purchase_order_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  net_paid := round(paid_total - refunded_total, 2);

  if paid_total > 0 and net_paid <= 0 then
    next_status := 'REFUNDED';
  elsif net_paid <= 0 then
    next_status := 'PENDING';
  elsif net_paid < purchase_total then
    next_status := 'PARTIALLY_PAID';
  else
    next_status := 'PAID';
  end if;

  update public.business_purchase_orders
  set payment_status = next_status,
      updated_at = now()
  where id = p_purchase_order_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  return next_status;
end;
$$;

revoke execute on function public.business_refresh_purchase_payment_status(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

create or replace function public.record_business_purchase_payment(
  p_purchase_order_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_payment_method text default null,
  p_status text default 'PAID',
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  purchase_row public.business_purchase_orders%rowtype;
  paid_total numeric := 0;
  refunded_total numeric := 0;
  net_paid numeric := 0;
  payment_id uuid;
  next_status text;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into purchase_row
  from public.business_purchase_orders
  where id = p_purchase_order_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Compra nao encontrada';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor do pagamento deve ser positivo';
  end if;

  if p_status is null or p_status not in ('PAID', 'REFUNDED') then
    raise exception 'Status de pagamento invalido';
  end if;

  if purchase_row.status = 'CANCELLED'
     and p_status = 'PAID' then
    raise exception 'Nao e permitido registrar pagamento em compra cancelada';
  end if;

  request_hash := md5(
    jsonb_build_object(
      'purchase_order_id', p_purchase_order_id,
      'amount', round(p_amount, 2),
      'payment_method', p_payment_method,
      'status', p_status,
      'paid_at', p_paid_at,
      'notes', p_notes
    )::text
  );

  existing_response := public.business_claim_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'record_business_purchase_payment',
    p_idempotency_key,
    request_hash
  );

  if existing_response is not null then
    return existing_response;
  end if;

  select
    coalesce(
      sum(amount) filter (where status = 'PAID'),
      0
    ),
    coalesce(
      sum(amount) filter (where status = 'REFUNDED'),
      0
    )
    into paid_total, refunded_total
  from public.business_purchase_payments
  where purchase_order_id = purchase_row.id
    and user_id = current_user_id
    and workspace_id = purchase_row.workspace_id;

  net_paid := round(paid_total - refunded_total, 2);

  if p_status = 'PAID'
     and net_paid + round(p_amount, 2) > purchase_row.total_cost then
    raise exception 'Pagamento acumulado maior que o valor da compra';
  end if;

  if p_status = 'REFUNDED'
     and round(p_amount, 2) > net_paid then
    raise exception 'Reembolso maior que o valor pago disponivel';
  end if;

  insert into public.business_purchase_payments (
    user_id,
    workspace_id,
    purchase_order_id,
    amount,
    payment_method,
    status,
    paid_at,
    notes
  )
  values (
    current_user_id,
    purchase_row.workspace_id,
    purchase_row.id,
    round(p_amount, 2),
    nullif(trim(p_payment_method), ''),
    p_status,
    coalesce(p_paid_at, now()),
    nullif(trim(p_notes), '')
  )
  returning id into payment_id;

  next_status :=
    public.business_refresh_purchase_payment_status(
      purchase_row.id,
      current_user_id,
      purchase_row.workspace_id
    );

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    purchase_row.workspace_id,
    'purchase',
    purchase_row.id,
    case
      when p_status = 'REFUNDED'
        then 'purchase_payment_refunded'
      else 'purchase_payment_recorded'
    end,
    jsonb_build_object(
      'payment_id', payment_id,
      'amount', round(p_amount, 2),
      'payment_status', next_status
    )
  );

  response := jsonb_build_object(
    'payment_id', payment_id,
    'purchase_order_id', purchase_row.id,
    'payment_status', next_status
  );

  perform public.business_complete_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'record_business_purchase_payment',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

revoke execute on function public.record_business_purchase_payment(
  uuid,
  numeric,
  text,
  text,
  text,
  timestamptz,
  text
) from public, anon;

grant execute on function public.record_business_purchase_payment(
  uuid,
  numeric,
  text,
  text,
  text,
  timestamptz,
  text
) to authenticated;

create or replace function public.business_guard_purchase_total_against_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paid_total numeric(12,2) := 0;
  refunded_total numeric(12,2) := 0;
  net_paid numeric(12,2) := 0;
begin
  select
    coalesce(
      sum(amount) filter (where status = 'PAID'),
      0
    ),
    coalesce(
      sum(amount) filter (where status = 'REFUNDED'),
      0
    )
    into paid_total, refunded_total
  from public.business_purchase_payments
  where purchase_order_id = old.id
    and user_id = old.user_id
    and workspace_id = old.workspace_id;

  net_paid := round(paid_total - refunded_total, 2);

  if round(new.total_cost, 2) < net_paid then
    raise exception
      'Valor total da compra nao pode ficar abaixo do valor ja pago';
  end if;

  if paid_total > 0 and net_paid <= 0 then
    new.payment_status := 'REFUNDED';
  elsif net_paid <= 0 then
    new.payment_status := 'PENDING';
  elsif net_paid < round(new.total_cost, 2) then
    new.payment_status := 'PARTIALLY_PAID';
  else
    new.payment_status := 'PAID';
  end if;

  return new;
end;
$$;

revoke execute on function public.business_guard_purchase_total_against_payments()
from public, anon, authenticated;

drop trigger if exists guard_business_purchase_total_against_payments
on public.business_purchase_orders;

create trigger guard_business_purchase_total_against_payments
before update of total_cost
on public.business_purchase_orders
for each row
when (old.total_cost is distinct from new.total_cost)
execute function public.business_guard_purchase_total_against_payments();

create or replace view public.business_cash_flow_events
with (security_invoker = true)
as

-- Recebimentos e reembolsos de vendas.
select
  payment.user_id,
  payment.workspace_id,
  payment.id::text as event_id,
  coalesce(payment.paid_at, payment.created_at) as occurred_at,
  coalesce(payment.paid_at, payment.created_at)::date as event_date,
  case
    when payment.status = 'PAID' then 'INFLOW'
    else 'OUTFLOW'
  end as direction,
  case
    when payment.status = 'PAID' then 'SALE_PAYMENT'
    else 'SALE_REFUND'
  end as category,
  payment.amount::numeric(12,2) as amount,
  case
    when payment.status = 'PAID' then payment.amount
    else -payment.amount
  end::numeric(12,2) as signed_amount,
  case
    when payment.status = 'PAID' then 'Recebimento de venda'
    else 'Reembolso de venda'
  end as title,
  'business_payments'::text as source_type,
  payment.id as source_id,
  payment.sale_id as reference_id,
  payment.payment_method
from public.business_payments payment
where payment.status in ('PAID', 'REFUNDED')

union all

-- Pagamentos e estornos de compras.
select
  payment.user_id,
  payment.workspace_id,
  payment.id::text as event_id,
  coalesce(payment.paid_at, payment.created_at) as occurred_at,
  coalesce(payment.paid_at, payment.created_at)::date as event_date,
  case
    when payment.status = 'PAID' then 'OUTFLOW'
    else 'INFLOW'
  end as direction,
  case
    when payment.status = 'PAID' then 'PURCHASE_PAYMENT'
    else 'PURCHASE_REFUND'
  end as category,
  payment.amount::numeric(12,2) as amount,
  case
    when payment.status = 'PAID' then -payment.amount
    else payment.amount
  end::numeric(12,2) as signed_amount,
  case
    when payment.status = 'PAID' then 'Pagamento de compra'
    else 'Estorno de compra'
  end as title,
  'business_purchase_payments'::text as source_type,
  payment.id as source_id,
  payment.purchase_order_id as reference_id,
  payment.payment_method
from public.business_purchase_payments payment
where payment.status in ('PAID', 'REFUNDED')

union all

-- Despesas operacionais registradas no modulo de Despesas.
select
  expense.user_id,
  expense.workspace_id,
  expense.id::text as event_id,
  expense.spent_at::timestamptz as occurred_at,
  expense.spent_at as event_date,
  'OUTFLOW'::text as direction,
  'EXPENSE'::text as category,
  expense.amount::numeric(12,2) as amount,
  (-expense.amount)::numeric(12,2) as signed_amount,
  expense.description as title,
  'business_expenses'::text as source_type,
  expense.id as source_id,
  expense.id as reference_id,
  null::text as payment_method
from public.business_expenses expense

union all

-- Taxas de plataforma/cartao registradas diretamente na venda.
select
  sale.user_id,
  sale.workspace_id,
  ('platform_fee:' || sale.id::text) as event_id,
  coalesce(sale.delivered_at, sale.sale_date) as occurred_at,
  coalesce(sale.delivered_at, sale.sale_date)::date as event_date,
  'OUTFLOW'::text as direction,
  'PLATFORM_FEE'::text as category,
  costs.amount::numeric(12,2) as amount,
  (-costs.amount)::numeric(12,2) as signed_amount,
  'Taxas da venda'::text as title,
  'business_sales'::text as source_type,
  sale.id as source_id,
  sale.id as reference_id,
  null::text as payment_method
from public.business_sales sale
join lateral (
  select round(coalesce(sum(item.platform_fee), 0), 2) as amount
  from public.business_sale_items item
  where item.sale_id = sale.id
    and item.user_id = sale.user_id
    and item.workspace_id = sale.workspace_id
) costs on true
where sale.order_status <> 'CANCELLED'
  and costs.amount > 0

union all

-- Custos adicionais diretamente vinculados a itens vendidos.
select
  sale.user_id,
  sale.workspace_id,
  ('sale_additional_costs:' || sale.id::text) as event_id,
  coalesce(sale.delivered_at, sale.sale_date) as occurred_at,
  coalesce(sale.delivered_at, sale.sale_date)::date as event_date,
  'OUTFLOW'::text as direction,
  'SALE_ADDITIONAL_COST'::text as category,
  costs.amount::numeric(12,2) as amount,
  (-costs.amount)::numeric(12,2) as signed_amount,
  'Custos adicionais da venda'::text as title,
  'business_sales'::text as source_type,
  sale.id as source_id,
  sale.id as reference_id,
  null::text as payment_method
from public.business_sales sale
join lateral (
  select round(coalesce(sum(item.additional_costs), 0), 2) as amount
  from public.business_sale_items item
  where item.sale_id = sale.id
    and item.user_id = sale.user_id
    and item.workspace_id = sale.workspace_id
) costs on true
where sale.order_status <> 'CANCELLED'
  and costs.amount > 0

union all

-- Compatibilidade com vendas antigas que armazenavam frete no item.
select
  sale.user_id,
  sale.workspace_id,
  ('legacy_shipping_cost:' || sale.id::text) as event_id,
  coalesce(sale.delivered_at, sale.sale_date) as occurred_at,
  coalesce(sale.delivered_at, sale.sale_date)::date as event_date,
  'OUTFLOW'::text as direction,
  'LEGACY_SHIPPING_COST'::text as category,
  costs.amount::numeric(12,2) as amount,
  (-costs.amount)::numeric(12,2) as signed_amount,
  'Custo de entrega legado'::text as title,
  'business_sales'::text as source_type,
  sale.id as source_id,
  sale.id as reference_id,
  null::text as payment_method
from public.business_sales sale
join lateral (
  select round(coalesce(sum(item.shipping_cost), 0), 2) as amount
  from public.business_sale_items item
  where item.sale_id = sale.id
    and item.user_id = sale.user_id
    and item.workspace_id = sale.workspace_id
) costs on true
where sale.order_status <> 'CANCELLED'
  and costs.amount > 0

union all

-- Custo real da entrega da venda.
select
  sale.user_id,
  sale.workspace_id,
  ('delivery_cost:' || sale.id::text) as event_id,
  coalesce(sale.delivered_at, sale.sale_date) as occurred_at,
  coalesce(sale.delivered_at, sale.sale_date)::date as event_date,
  'OUTFLOW'::text as direction,
  'DELIVERY_COST'::text as category,
  sale.delivery_cost::numeric(12,2) as amount,
  (-sale.delivery_cost)::numeric(12,2) as signed_amount,
  'Custo de entrega'::text as title,
  'business_sales'::text as source_type,
  sale.id as source_id,
  sale.id as reference_id,
  null::text as payment_method
from public.business_sales sale
where sale.order_status <> 'CANCELLED'
  and coalesce(sale.delivery_cost, 0) > 0;

grant select on public.business_cash_flow_events to authenticated;

create or replace function public.get_business_cash_flow(
  p_workspace_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_limit integer;
  opening_balance numeric(14,2) := 0;
  total_inflows numeric(14,2) := 0;
  total_outflows numeric(14,2) := 0;
  net_cash_flow numeric(14,2) := 0;
  closing_balance numeric(14,2) := 0;
  event_count integer := 0;
  daily_series jsonb := '[]'::jsonb;
  category_breakdown jsonb := '[]'::jsonb;
  transactions jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  if p_start_date is not null
     and p_end_date is not null
     and p_end_date < p_start_date then
    raise exception 'Periodo do fluxo de caixa invalido';
  end if;

  normalized_limit := greatest(
    1,
    least(coalesce(p_limit, 100), 500)
  );

  if p_start_date is not null then
    select
      round(
        coalesce(sum(event.signed_amount), 0),
        2
      )
      into opening_balance
    from public.business_cash_flow_events event
    where event.user_id = current_user_id
      and event.workspace_id = p_workspace_id
      and event.event_date < p_start_date;
  end if;

  select
    round(
      coalesce(
        sum(
          case
            when event.direction = 'INFLOW'
              then event.amount
            else 0
          end
        ),
        0
      ),
      2
    ),
    round(
      coalesce(
        sum(
          case
            when event.direction = 'OUTFLOW'
              then event.amount
            else 0
          end
        ),
        0
      ),
      2
    ),
    count(*)::integer
    into total_inflows, total_outflows, event_count
  from public.business_cash_flow_events event
  where event.user_id = current_user_id
    and event.workspace_id = p_workspace_id
    and (
      p_start_date is null
      or event.event_date >= p_start_date
    )
    and (
      p_end_date is null
      or event.event_date <= p_end_date
    );

  net_cash_flow := round(
    total_inflows - total_outflows,
    2
  );

  closing_balance := round(
    opening_balance + net_cash_flow,
    2
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', daily.day,
        'inflows', daily.inflows,
        'outflows', daily.outflows,
        'net', daily.net,
        'balance', daily.balance
      )
      order by daily.day
    ),
    '[]'::jsonb
  )
  into daily_series
  from (
    select
      grouped.day,
      grouped.inflows,
      grouped.outflows,
      grouped.net,
      round(
        opening_balance +
        sum(grouped.net) over (
          order by grouped.day
          rows between unbounded preceding and current row
        ),
        2
      ) as balance
    from (
      select
        event.event_date as day,
        round(
          coalesce(
            sum(
              case
                when event.direction = 'INFLOW'
                  then event.amount
                else 0
              end
            ),
            0
          ),
          2
        ) as inflows,
        round(
          coalesce(
            sum(
              case
                when event.direction = 'OUTFLOW'
                  then event.amount
                else 0
              end
            ),
            0
          ),
          2
        ) as outflows,
        round(
          coalesce(sum(event.signed_amount), 0),
          2
        ) as net
      from public.business_cash_flow_events event
      where event.user_id = current_user_id
        and event.workspace_id = p_workspace_id
        and (
          p_start_date is null
          or event.event_date >= p_start_date
        )
        and (
          p_end_date is null
          or event.event_date <= p_end_date
        )
      group by event.event_date
    ) grouped
  ) daily;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'direction', category.direction,
        'category', category.category,
        'amount', category.amount,
        'events', category.events
      )
      order by category.direction, category.category
    ),
    '[]'::jsonb
  )
  into category_breakdown
  from (
    select
      event.direction,
      event.category,
      round(sum(event.amount), 2) as amount,
      count(*)::integer as events
    from public.business_cash_flow_events event
    where event.user_id = current_user_id
      and event.workspace_id = p_workspace_id
      and (
        p_start_date is null
        or event.event_date >= p_start_date
      )
      and (
        p_end_date is null
        or event.event_date <= p_end_date
      )
    group by
      event.direction,
      event.category
  ) category;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          transaction.source_type
          || ':'
          || transaction.event_id,
        'occurred_at', transaction.occurred_at,
        'date', transaction.event_date,
        'direction', transaction.direction,
        'category', transaction.category,
        'amount', transaction.amount,
        'signed_amount', transaction.signed_amount,
        'title', transaction.title,
        'source_type', transaction.source_type,
        'source_id', transaction.source_id,
        'reference_id', transaction.reference_id,
        'payment_method', transaction.payment_method
      )
      order by
        transaction.occurred_at desc,
        transaction.event_id desc
    ),
    '[]'::jsonb
  )
  into transactions
  from (
    select event.*
    from public.business_cash_flow_events event
    where event.user_id = current_user_id
      and event.workspace_id = p_workspace_id
      and (
        p_start_date is null
        or event.event_date >= p_start_date
      )
      and (
        p_end_date is null
        or event.event_date <= p_end_date
      )
    order by
      event.occurred_at desc,
      event.event_id desc
    limit normalized_limit
  ) transaction;

  return jsonb_build_object(
    'period',
      jsonb_build_object(
        'start_date', p_start_date,
        'end_date', p_end_date
      ),
    'summary',
      jsonb_build_object(
        'opening_balance', opening_balance,
        'inflows', total_inflows,
        'outflows', total_outflows,
        'net_cash_flow', net_cash_flow,
        'closing_balance', closing_balance,
        'event_count', event_count
      ),
    'daily', daily_series,
    'categories', category_breakdown,
    'transactions', transactions
  );
end;
$$;

revoke execute on function public.get_business_cash_flow(
  uuid,
  date,
  date,
  integer
) from public, anon;

grant execute on function public.get_business_cash_flow(
  uuid,
  date,
  date,
  integer
) to authenticated;
