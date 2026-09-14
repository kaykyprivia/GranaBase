-- Delivery financial model for Business sales.
-- Historical business_sale_items.shipping_cost remains untouched for backwards compatibility.
-- New sales use sale-level delivery_fee (charged to customer) and delivery_cost (real expense).

alter table public.business_sales
  add column if not exists delivery_fee numeric(12,2) not null default 0
    check (delivery_fee >= 0),
  add column if not exists delivery_cost numeric(12,2) not null default 0
    check (delivery_cost >= 0);

comment on column public.business_sales.delivery_fee is
  'Delivery amount charged to the customer. Counts as sale revenue.';

comment on column public.business_sales.delivery_cost is
  'Actual delivery expense paid by the business. Reduces sale profit.';

-- Replace sale creation RPC with sale-level delivery values.
drop function if exists public.create_business_sale(
  uuid,
  jsonb,
  text,
  uuid,
  timestamptz,
  text,
  boolean,
  text
);

create function public.create_business_sale(
  p_workspace_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_customer_id uuid default null,
  p_sale_date timestamptz default now(),
  p_notes text default null,
  p_reserve boolean default true,
  p_sales_channel text default 'IN_PERSON',
  p_delivery_fee numeric default 0,
  p_delivery_cost numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_id uuid;
  item_payload jsonb;
  item_product_id uuid;
  quantity integer;
  unit_sale_price numeric(12,2);
  discount_amount numeric(12,2);
  platform_fee numeric(12,2);
  shipping_cost numeric(12,2);
  additional_costs numeric(12,2);
  gross_amount numeric(12,2);
  final_amount numeric(12,2);
  available_quantity integer;
  request_hash text;
  existing_response jsonb;
  reserve_response jsonb;
  response jsonb;
  normalized_sales_channel text := upper(trim(coalesce(p_sales_channel, 'IN_PERSON')));
  delivery_fee_value numeric(12,2) := round(coalesce(p_delivery_fee, 0), 2);
  delivery_cost_value numeric(12,2) := round(coalesce(p_delivery_cost, 0), 2);
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  if normalized_sales_channel not in (
    'UNSPECIFIED',
    'IN_PERSON',
    'WHATSAPP',
    'INSTAGRAM',
    'FACEBOOK_MARKETPLACE',
    'SHOPEE',
    'MERCADO_LIVRE',
    'WEBSITE',
    'OTHER'
  ) then
    raise exception 'Canal de venda invalido';
  end if;

  if delivery_fee_value < 0 or delivery_cost_value < 0 then
    raise exception 'Valores de entrega invalidos';
  end if;

  request_hash := md5(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'items', p_items,
    'customer_id', p_customer_id,
    'sale_date', p_sale_date,
    'notes', p_notes,
    'reserve', p_reserve,
    'sales_channel', normalized_sales_channel,
    'delivery_fee', delivery_fee_value,
    'delivery_cost', delivery_cost_value
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_sale',
    p_idempotency_key,
    request_hash
  );

  if existing_response is not null then
    return existing_response;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Venda precisa receber uma lista de itens';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Venda precisa ter ao menos um item';
  end if;

  if p_customer_id is not null and not exists (
    select 1
    from public.business_customers
    where id = p_customer_id
      and user_id = current_user_id
      and workspace_id = p_workspace_id
  ) then
    raise exception 'Cliente nao encontrado';
  end if;

  insert into public.business_sales (
    user_id,
    workspace_id,
    customer_id,
    order_status,
    payment_status,
    sale_date,
    notes,
    sales_channel,
    delivery_fee,
    delivery_cost
  )
  values (
    current_user_id,
    p_workspace_id,
    p_customer_id,
    'DRAFT',
    'PENDING',
    coalesce(p_sale_date, now()),
    nullif(trim(p_notes), ''),
    normalized_sales_channel,
    delivery_fee_value,
    delivery_cost_value
  )
  returning id into sale_id;

  for item_payload in
    select *
    from jsonb_array_elements(p_items)
  loop
    item_product_id := (item_payload->>'product_id')::uuid;
    quantity := (item_payload->>'quantity')::integer;
    unit_sale_price := round((item_payload->>'unit_sale_price')::numeric, 2);
    discount_amount := round(coalesce((item_payload->>'discount_amount')::numeric, 0), 2);
    platform_fee := round(coalesce((item_payload->>'platform_fee')::numeric, 0), 2);
    shipping_cost := round(coalesce((item_payload->>'shipping_cost')::numeric, 0), 2);
    additional_costs := round(coalesce((item_payload->>'additional_costs')::numeric, 0), 2);

    if not exists (
      select 1
      from public.business_products
      where id = item_product_id
        and user_id = current_user_id
        and workspace_id = p_workspace_id
        and active = true
    ) then
      raise exception 'Produto da venda nao encontrado';
    end if;

    if quantity <= 0
      or unit_sale_price < 0
      or discount_amount < 0
      or platform_fee < 0
      or shipping_cost < 0
      or additional_costs < 0 then
      raise exception 'Item de venda invalido';
    end if;

    gross_amount := round(quantity * unit_sale_price, 2);

    if discount_amount > gross_amount then
      raise exception 'Desconto maior que o valor bruto';
    end if;

    final_amount := round(gross_amount - discount_amount, 2);

    select coalesce(sum(remaining_quantity - reserved_quantity), 0)
      into available_quantity
    from public.business_inventory_lots
    where user_id = current_user_id
      and workspace_id = p_workspace_id
      and product_id = item_product_id;

    if available_quantity < quantity then
      raise exception 'Estoque insuficiente para criar a venda';
    end if;

    insert into public.business_sale_items (
      user_id,
      workspace_id,
      sale_id,
      product_id,
      quantity,
      unit_sale_price,
      gross_amount,
      discount_amount,
      final_amount,
      platform_fee,
      shipping_cost,
      additional_costs,
      gross_profit,
      net_profit,
      margin_pct
    )
    values (
      current_user_id,
      p_workspace_id,
      sale_id,
      item_product_id,
      quantity,
      unit_sale_price,
      gross_amount,
      discount_amount,
      final_amount,
      platform_fee,
      shipping_cost,
      additional_costs,
      final_amount,
      round(final_amount - platform_fee - shipping_cost - additional_costs, 2),
      case
        when final_amount > 0 then
          round(
            (
              (
                final_amount
                - platform_fee
                - shipping_cost
                - additional_costs
              ) / final_amount
            ) * 100,
            4
          )
        else null
      end
    );
  end loop;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    p_workspace_id,
    'sale',
    sale_id,
    'sale_created',
    jsonb_build_object(
      'items_count', jsonb_array_length(p_items),
      'reserve', p_reserve,
      'sales_channel', normalized_sales_channel,
      'delivery_fee', delivery_fee_value,
      'delivery_cost', delivery_cost_value
    )
  );

  if coalesce(p_reserve, true) then
    reserve_response := public.reserve_business_sale(
      sale_id,
      p_idempotency_key || ':reserve'
    );
  end if;

  response := jsonb_build_object(
    'sale_id', sale_id,
    'status',
      case
        when coalesce(p_reserve, true) then 'RESERVED'
        else 'DRAFT'
      end,
    'reserve', reserve_response
  );

  perform public.business_complete_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_sale',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

revoke all on function public.create_business_sale(
  uuid,
  jsonb,
  text,
  uuid,
  timestamptz,
  text,
  boolean,
  text,
  numeric,
  numeric
) from public, anon;

grant execute on function public.create_business_sale(
  uuid,
  jsonb,
  text,
  uuid,
  timestamptz,
  text,
  boolean,
  text,
  numeric,
  numeric
) to authenticated;

-- Delivery-aware payment semantics.
create or replace function public.business_refresh_sale_payment_status(
  p_sale_id uuid,
  p_user_id uuid,
  p_workspace_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  gross_sale_total numeric(12,2);
  refund_total numeric(12,2);
  net_sale_total numeric(12,2);
  paid_total numeric(12,2);
  refunded_total numeric(12,2);
  net_paid numeric(12,2);
  next_status text;
begin
  select round(
    coalesce(sum(item.final_amount), 0) +
    coalesce(max(sale.delivery_fee), 0),
    2
  )
    into gross_sale_total
  from public.business_sales sale
  left join public.business_sale_items item
    on item.sale_id = sale.id
   and item.user_id = p_user_id
   and item.workspace_id = p_workspace_id
  where sale.id = p_sale_id
    and sale.user_id = p_user_id
    and sale.workspace_id = p_workspace_id
  group by sale.id;

  select coalesce(sum(refund_amount), 0)
    into refund_total
  from public.business_sale_returns
  where sale_id = p_sale_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  net_sale_total := greatest(
    round(gross_sale_total - refund_total, 2),
    0
  );

  select
    coalesce(sum(amount) filter (where status = 'PAID'), 0),
    coalesce(sum(amount) filter (where status = 'REFUNDED'), 0)
    into paid_total, refunded_total
  from public.business_payments
  where sale_id = p_sale_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  net_paid := round(paid_total - refunded_total, 2);

  next_status := case
    when refunded_total > 0
      and net_sale_total <= 0
      and net_paid <= 0
      then 'REFUNDED'
    when net_paid <= 0
      then 'PENDING'
    when net_paid < net_sale_total
      then 'PARTIALLY_PAID'
    else 'PAID'
  end;

  update public.business_sales
  set payment_status = next_status
  where id = p_sale_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  return next_status;
end;
$$;

-- Recalculate existing sales so historical payment statuses are corrected immediately.
with financials as (
  select
    sale.id,
    greatest(
      round(
        coalesce(items.gross_sale_total, 0) +
        coalesce(sale.delivery_fee, 0) -
        coalesce(returns.refund_total, 0),
        2
      ),
      0
    ) as net_sale_total,
    round(
      coalesce(payments.paid_total, 0) -
      coalesce(payments.refunded_total, 0),
      2
    ) as net_paid,
    coalesce(payments.refunded_total, 0) as refunded_total
  from public.business_sales sale
  left join (
    select
      sale_id,
      sum(final_amount) as gross_sale_total
    from public.business_sale_items
    group by sale_id
  ) items on items.sale_id = sale.id
  left join (
    select
      sale_id,
      sum(refund_amount) as refund_total
    from public.business_sale_returns
    group by sale_id
  ) returns on returns.sale_id = sale.id
  left join (
    select
      sale_id,
      coalesce(sum(amount) filter (where status = 'PAID'), 0) as paid_total,
      coalesce(sum(amount) filter (where status = 'REFUNDED'), 0) as refunded_total
    from public.business_payments
    group by sale_id
  ) payments on payments.sale_id = sale.id
)
update public.business_sales sale
set payment_status = case
  when financials.refunded_total > 0
    and financials.net_sale_total <= 0
    and financials.net_paid <= 0
    then 'REFUNDED'
  when financials.net_paid <= 0
    then 'PENDING'
  when financials.net_paid < financials.net_sale_total
    then 'PARTIALLY_PAID'
  else 'PAID'
end
from financials
where financials.id = sale.id;

create or replace function public.record_business_payment(
  p_sale_id uuid,
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
  sale_row public.business_sales%rowtype;
  sale_total numeric(12,2);
  paid_total numeric(12,2);
  refunded_total numeric(12,2);
  next_status text;
  payment_id uuid;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into sale_row
  from public.business_sales
  where id = p_sale_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada';
  end if;

  request_hash := md5(jsonb_build_object(
    'sale_id', p_sale_id,
    'amount', p_amount,
    'payment_method', p_payment_method,
    'status', p_status,
    'paid_at', p_paid_at,
    'notes', p_notes
  )::text);
  existing_response := public.business_claim_idempotency(current_user_id, sale_row.workspace_id, 'record_business_payment', p_idempotency_key, request_hash);
  if existing_response is not null then
    return existing_response;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor do pagamento deve ser positivo';
  end if;
  if p_status is null or p_status not in ('PAID', 'REFUNDED') then
    raise exception 'Status de pagamento invalido';
  end if;

  select greatest(
    round(
      coalesce(sum(item.final_amount), 0) +
      coalesce(sale_row.delivery_fee, 0) -
      coalesce(
        (
          select sum(sale_return.refund_amount)
          from public.business_sale_returns sale_return
          where sale_return.sale_id = p_sale_id
            and sale_return.user_id = current_user_id
            and sale_return.workspace_id = sale_row.workspace_id
        ),
        0
      ),
      2
    ),
    0
  )
    into sale_total
  from public.business_sale_items item
  where item.sale_id = p_sale_id
    and item.user_id = current_user_id
    and item.workspace_id = sale_row.workspace_id;

  select
    coalesce(sum(amount) filter (where status = 'PAID'), 0),
    coalesce(sum(amount) filter (where status = 'REFUNDED'), 0)
    into paid_total, refunded_total
  from public.business_payments
  where sale_id = p_sale_id
    and user_id = current_user_id
    and workspace_id = sale_row.workspace_id;

  if p_status = 'PAID' and paid_total - refunded_total + round(p_amount, 2) > sale_total then
    raise exception 'Pagamento acumulado maior que o valor devido';
  end if;
  if p_status = 'REFUNDED' and round(p_amount, 2) > paid_total - refunded_total then
    raise exception 'Reembolso maior que o valor pago disponivel';
  end if;

  insert into public.business_payments (
    user_id,
    workspace_id,
    sale_id,
    amount,
    payment_method,
    status,
    paid_at,
    notes
  )
  values (
    current_user_id,
    sale_row.workspace_id,
    sale_row.id,
    round(p_amount, 2),
    nullif(trim(p_payment_method), ''),
    p_status,
    coalesce(p_paid_at, now()),
    nullif(trim(p_notes), '')
  )
  returning id into payment_id;

  next_status := public.business_refresh_sale_payment_status(sale_row.id, current_user_id, sale_row.workspace_id);

  perform public.business_log_audit(current_user_id, current_user_id, sale_row.workspace_id, 'sale', sale_row.id, 'payment_recorded', jsonb_build_object('payment_id', payment_id, 'amount', round(p_amount, 2), 'payment_status', next_status));

  response := jsonb_build_object('payment_id', payment_id, 'sale_id', sale_row.id, 'payment_status', next_status);
  perform public.business_complete_idempotency(current_user_id, sale_row.workspace_id, 'record_business_payment', p_idempotency_key, response);
  return response;
end;
$$;


-- Delivery-aware sales summary.
create or replace function public.get_business_sales_summary(
  p_workspace_id uuid,
  p_status text default 'all',
  p_payment_status text default 'all',
  p_start_date date default null,
  p_end_date date default null,
  p_search text default null,
  p_sales_channel text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
  normalized_sales_channel text := upper(trim(coalesce(p_sales_channel, 'all')));
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  if p_status not in (
    'all',
    'open',
    'DRAFT',
    'RESERVED',
    'SEPARATED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURNED'
  ) then
    raise exception 'Filtro de status de venda invalido';
  end if;

  if p_payment_status not in (
    'all',
    'PENDING',
    'PARTIALLY_PAID',
    'PAID',
    'REFUNDED'
  ) then
    raise exception 'Filtro de pagamento invalido';
  end if;

  if normalized_sales_channel not in (
    'ALL',
    'UNSPECIFIED',
    'IN_PERSON',
    'WHATSAPP',
    'INSTAGRAM',
    'FACEBOOK_MARKETPLACE',
    'SHOPEE',
    'MERCADO_LIVRE',
    'WEBSITE',
    'OTHER'
  ) then
    raise exception 'Filtro de canal de venda invalido';
  end if;

  if p_start_date is not null
    and p_end_date is not null
    and p_end_date < p_start_date then
    raise exception 'Periodo de vendas invalido';
  end if;

  with filtered_sales as (
    select
      sale.id,
      sale.order_status,
      sale.delivery_fee,
      sale.delivery_cost
    from public.business_sales sale
    where sale.user_id = current_user_id
      and sale.workspace_id = p_workspace_id
      and (
        p_status = 'all'
        or (
          p_status = 'open'
          and sale.order_status not in ('DELIVERED', 'CANCELLED', 'RETURNED')
        )
        or sale.order_status = p_status
      )
      and (
        p_payment_status = 'all'
        or sale.payment_status = p_payment_status
      )
      and (
        normalized_sales_channel = 'ALL'
        or sale.sales_channel = normalized_sales_channel
      )
      and (
        p_start_date is null
        or sale.sale_date >= p_start_date::timestamptz
      )
      and (
        p_end_date is null
        or sale.sale_date < (p_end_date + 1)::timestamptz
      )
      and (
        normalized_search is null
        or position(normalized_search in lower(sale.id::text)) > 0
        or position(normalized_search in lower(sale.sale_number::text)) > 0
        or exists (
          select 1
          from public.business_customers customer
          where customer.id = sale.customer_id
            and customer.user_id = current_user_id
            and customer.workspace_id = p_workspace_id
            and (
              position(normalized_search in lower(customer.name)) > 0
              or position(
                normalized_search
                in lower(coalesce(customer.whatsapp, ''))
              ) > 0
            )
        )
        or exists (
          select 1
          from public.business_sale_items item
          join public.business_products product
            on product.id = item.product_id
           and product.user_id = item.user_id
           and product.workspace_id = item.workspace_id
          where item.sale_id = sale.id
            and item.user_id = current_user_id
            and item.workspace_id = p_workspace_id
            and position(normalized_search in lower(product.name)) > 0
        )
      )
  ),
  return_quantity_by_item as (
    select
      return_item.sale_item_id,
      sum(return_item.quantity) filter (
        where return_item.restockable
      ) as restockable_quantity
    from public.business_sale_return_items return_item
    join public.business_sale_items sale_item
      on sale_item.id = return_item.sale_item_id
     and sale_item.user_id = current_user_id
     and sale_item.workspace_id = p_workspace_id
    join filtered_sales filtered_sale
      on filtered_sale.id = sale_item.sale_id
    where return_item.user_id = current_user_id
      and return_item.workspace_id = p_workspace_id
    group by return_item.sale_item_id
  ),
  item_financials as (
    select
      item.sale_id,
      sum(item.final_amount) as gross_revenue,
      sum(item.net_profit) as base_profit,
      sum(
        case
          when item.quantity <= 0 then 0
          else (
            item.cogs_amount / item.quantity
          ) * least(
            item.quantity,
            coalesce(return_quantity.restockable_quantity, 0)
          )
        end
      ) as recovered_cogs
    from public.business_sale_items item
    join filtered_sales filtered_sale
      on filtered_sale.id = item.sale_id
    left join return_quantity_by_item return_quantity
      on return_quantity.sale_item_id = item.id
    where item.user_id = current_user_id
      and item.workspace_id = p_workspace_id
    group by item.sale_id
  ),
  return_financials as (
    select
      sale_return.sale_id,
      sum(sale_return.refund_amount) as refunded_amount
    from public.business_sale_returns sale_return
    join filtered_sales filtered_sale
      on filtered_sale.id = sale_return.sale_id
    where sale_return.user_id = current_user_id
      and sale_return.workspace_id = p_workspace_id
    group by sale_return.sale_id
  ),
  payment_financials as (
    select
      payment.sale_id,
      sum(payment.amount) filter (
        where payment.status = 'PAID'
      ) as paid_amount,
      sum(payment.amount) filter (
        where payment.status = 'REFUNDED'
      ) as refunded_payment_amount
    from public.business_payments payment
    join filtered_sales filtered_sale
      on filtered_sale.id = payment.sale_id
    where payment.user_id = current_user_id
      and payment.workspace_id = p_workspace_id
    group by payment.sale_id
  ),
  sale_financials as (
    select
      filtered_sale.id,
      filtered_sale.order_status,
      greatest(
        coalesce(item_financial.gross_revenue, 0)
        + coalesce(filtered_sale.delivery_fee, 0)
        - coalesce(return_financial.refunded_amount, 0),
        0
      ) as net_revenue,
      (
        coalesce(item_financial.base_profit, 0)
        + coalesce(filtered_sale.delivery_fee, 0)
        - coalesce(filtered_sale.delivery_cost, 0)
        - coalesce(return_financial.refunded_amount, 0)
        + coalesce(item_financial.recovered_cogs, 0)
      ) as net_profit,
      greatest(
        coalesce(item_financial.gross_revenue, 0)
        + coalesce(filtered_sale.delivery_fee, 0)
        - coalesce(return_financial.refunded_amount, 0)
        - (
          coalesce(payment_financial.paid_amount, 0)
          - coalesce(payment_financial.refunded_payment_amount, 0)
        ),
        0
      ) as remaining_amount
    from filtered_sales filtered_sale
    left join item_financials item_financial
      on item_financial.sale_id = filtered_sale.id
    left join return_financials return_financial
      on return_financial.sale_id = filtered_sale.id
    left join payment_financials payment_financial
      on payment_financial.sale_id = filtered_sale.id
  )
  select jsonb_build_object(
    'count',
      count(*) filter (
        where order_status <> 'CANCELLED'
      ),
    'realized',
      count(*) filter (
        where order_status in ('DELIVERED', 'RETURNED')
      ),
    'revenue',
      coalesce(
        sum(net_revenue) filter (
          where order_status <> 'CANCELLED'
        ),
        0
      ),
    'receivable',
      coalesce(
        sum(remaining_amount) filter (
          where order_status <> 'CANCELLED'
        ),
        0
      ),
    'profit',
      coalesce(
        sum(net_profit) filter (
          where order_status in ('DELIVERED', 'RETURNED')
        ),
        0
      ),
    'ticket',
      case
        when count(*) filter (
          where order_status <> 'CANCELLED'
        ) = 0 then 0
        else
          coalesce(
            sum(net_revenue) filter (
              where order_status <> 'CANCELLED'
            ),
            0
          )
          /
          count(*) filter (
            where order_status <> 'CANCELLED'
          )
      end
  )
  into result
  from sale_financials;

  return result;
end;
$$;

revoke all on function public.get_business_sales_summary(
  uuid,
  text,
  text,
  date,
  date,
  text,
  text
) from public, anon;

grant execute on function public.get_business_sales_summary(
  uuid,
  text,
  text,
  date,
  date,
  text,
  text
) to authenticated;


-- Delivery-aware reports analytics.
create or replace function public.get_business_reports_analytics(
  p_workspace_id uuid,
  p_period text default 'month',
  p_today date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  range_start date;
  range_end date := coalesce(p_today, current_date);
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  if p_period not in ('month', '3m', '6m', '12m', 'all') then
    raise exception 'Periodo de relatorio invalido';
  end if;

  range_start :=
    case p_period
      when 'month' then date_trunc('month', range_end)::date
      when '3m' then (date_trunc('month', range_end) - interval '2 months')::date
      when '6m' then (date_trunc('month', range_end) - interval '5 months')::date
      when '12m' then (date_trunc('month', range_end) - interval '11 months')::date
      else null
    end;

  return (
    with period_sales as (
      select
        sale.id,
        sale.sale_date,
        sale.order_status,
        sale.delivery_fee,
        sale.delivery_cost
      from public.business_sales sale
      where sale.user_id = current_user_id
        and sale.workspace_id = p_workspace_id
        and sale.order_status <> 'CANCELLED'
        and (
          range_start is null
          or sale.sale_date::date >= range_start
        )
        and sale.sale_date::date <= range_end
    ),

    period_sale_item_totals as (
      select
        item.sale_id,
        coalesce(sum(item.final_amount), 0) as gross_revenue
      from public.business_sale_items item
      join period_sales sale
        on sale.id = item.sale_id
      where item.user_id = current_user_id
        and item.workspace_id = p_workspace_id
      group by item.sale_id
    ),

    period_sale_refunds as (
      select
        sale_return.sale_id,
        coalesce(sum(sale_return.refund_amount), 0) as refunds
      from public.business_sale_returns sale_return
      join period_sales sale
        on sale.id = sale_return.sale_id
      where sale_return.user_id = current_user_id
        and sale_return.workspace_id = p_workspace_id
      group by sale_return.sale_id
    ),

    period_sale_values as (
      select
        sale.id as sale_id,
        greatest(
          coalesce(items.gross_revenue, 0)
          + coalesce(sale.delivery_fee, 0)
          - coalesce(refunds.refunds, 0),
          0
        ) as net_revenue
      from period_sales sale
      left join period_sale_item_totals items
        on items.sale_id = sale.id
      left join period_sale_refunds refunds
        on refunds.sale_id = sale.id
    ),

    period_sale_payments as (
      select
        payment.sale_id,
        coalesce(
          sum(
            case
              when payment.status = 'PAID'
                then payment.amount
              when payment.status = 'REFUNDED'
                then -payment.amount
              else 0
            end
          ),
          0
        ) as net_paid
      from public.business_payments payment
      join period_sales sale
        on sale.id = payment.sale_id
      where payment.user_id = current_user_id
        and payment.workspace_id = p_workspace_id
      group by payment.sale_id
    ),

    receivable_value as (
      select
        coalesce(
          sum(
            greatest(
              sale.net_revenue
              - coalesce(payment.net_paid, 0),
              0
            )
          ),
          0
        ) as value
      from period_sale_values sale
      left join period_sale_payments payment
        on payment.sale_id = sale.sale_id
    ),

    realized_sales as (
      select *
      from period_sales
      where order_status in ('DELIVERED', 'RETURNED')
    ),

    realized_items as (
      select
        item.id,
        item.sale_id,
        item.product_id,
        item.quantity,
        item.final_amount,
        item.cogs_amount,
        item.net_profit
      from public.business_sale_items item
      join realized_sales sale
        on sale.id = item.sale_id
      where item.user_id = current_user_id
        and item.workspace_id = p_workspace_id
    ),

    realized_item_totals as (
      select
        item.sale_id,
        coalesce(sum(item.final_amount), 0) as gross_revenue,
        coalesce(sum(item.net_profit), 0) as base_profit
      from realized_items item
      group by item.sale_id
    ),

    realized_refunds as (
      select
        sale_return.sale_id,
        coalesce(sum(sale_return.refund_amount), 0) as refunds
      from public.business_sale_returns sale_return
      join realized_sales sale
        on sale.id = sale_return.sale_id
      where sale_return.user_id = current_user_id
        and sale_return.workspace_id = p_workspace_id
      group by sale_return.sale_id
    ),

    restockable_quantity_by_item as (
      select
        return_item.sale_item_id,
        coalesce(
          sum(return_item.quantity) filter (
            where return_item.restockable
          ),
          0
        ) as quantity
      from public.business_sale_return_items return_item
      join realized_items item
        on item.id = return_item.sale_item_id
      where return_item.user_id = current_user_id
        and return_item.workspace_id = p_workspace_id
      group by return_item.sale_item_id
    ),

    returned_quantity_by_item as (
      select
        return_item.sale_item_id,
        coalesce(sum(return_item.quantity), 0) as quantity
      from public.business_sale_return_items return_item
      join realized_items item
        on item.id = return_item.sale_item_id
      where return_item.user_id = current_user_id
        and return_item.workspace_id = p_workspace_id
      group by return_item.sale_item_id
    ),

    recovered_cogs_by_sale as (
      select
        item.sale_id,
        coalesce(
          sum(
            case
              when item.quantity > 0 then
                (
                  item.cogs_amount
                  / item.quantity
                )
                * least(
                    item.quantity,
                    coalesce(returned.quantity, 0)
                  )
              else 0
            end
          ),
          0
        ) as recovered_cogs
      from realized_items item
      left join restockable_quantity_by_item returned
        on returned.sale_item_id = item.id
      group by item.sale_id
    ),

    realized_financials as (
      select
        sale.id as sale_id,
        sale.sale_date,
        greatest(
          coalesce(items.gross_revenue, 0)
          + coalesce(sale.delivery_fee, 0)
          - coalesce(refunds.refunds, 0),
          0
        ) as revenue,
        (
          coalesce(items.base_profit, 0)
          + coalesce(sale.delivery_fee, 0)
          - coalesce(sale.delivery_cost, 0)
          - coalesce(refunds.refunds, 0)
          + coalesce(recovered.recovered_cogs, 0)
        ) as profit
      from realized_sales sale
      left join realized_item_totals items
        on items.sale_id = sale.id
      left join realized_refunds refunds
        on refunds.sale_id = sale.id
      left join recovered_cogs_by_sale recovered
        on recovered.sale_id = sale.id
    ),

    period_expenses as (
      select expense.*
      from public.business_expenses expense
      where expense.user_id = current_user_id
        and expense.workspace_id = p_workspace_id
        and (
          range_start is null
          or expense.spent_at::date >= range_start
        )
        and expense.spent_at::date <= range_end
    ),

    received_value as (
      select
        coalesce(
          sum(
            case
              when payment.status = 'PAID'
                then payment.amount
              when payment.status = 'REFUNDED'
                then -payment.amount
              else 0
            end
          ),
          0
        ) as value
      from public.business_payments payment
      where payment.user_id = current_user_id
        and payment.workspace_id = p_workspace_id
        and payment.paid_at is not null
        and (
          range_start is null
          or payment.paid_at::date >= range_start
        )
        and payment.paid_at::date <= range_end
    ),

    summary_values as (
      select
        coalesce(
          (select sum(revenue) from realized_financials),
          0
        ) as revenue,
        coalesce(
          (select sum(profit) from realized_financials),
          0
        ) as sale_profit,
        coalesce(
          (select sum(amount) from period_expenses),
          0
        ) as expenses,
        (
          select count(*)::integer
          from realized_sales
        ) as sales_count,
        (
          select value
          from received_value
        ) as received,
        (
          select value
          from receivable_value
        ) as receivable
    ),

    expense_categories as (
      select
        expense.category,
        case expense.category
          when 'gasolina' then 'Gasolina'
          when 'embalagem' then 'Embalagem'
          when 'anuncios' then 'Anúncios'
          when 'entrega' then 'Entrega'
          when 'manutencao' then 'Manutenção'
          when 'taxas' then 'Taxas'
          else 'Outras'
        end as label,
        round(sum(expense.amount)::numeric, 2) as value
      from period_expenses expense
      group by expense.category
    ),

    product_values as (
      select
        item.product_id,
        coalesce(product.name, 'Produto') as name,
        sum(
          greatest(
            item.quantity
            - least(
                item.quantity,
                coalesce(returned.quantity, 0)
              ),
            0
          )
        ) as units,
        sum(
          case
            when item.quantity > 0 then
              item.final_amount
              * (
                  greatest(
                    item.quantity
                    - least(
                        item.quantity,
                        coalesce(returned.quantity, 0)
                      ),
                    0
                  )::numeric
                  / item.quantity
                )
            else 0
          end
        ) as revenue,
        sum(
          case
            when item.quantity > 0 then
              item.net_profit
              * (
                  greatest(
                    item.quantity
                    - least(
                        item.quantity,
                        coalesce(returned.quantity, 0)
                      ),
                    0
                  )::numeric
                  / item.quantity
                )
            else 0
          end
        ) as profit
      from realized_items item
      left join returned_quantity_by_item returned
        on returned.sale_item_id = item.id
      left join public.business_products product
        on product.id = item.product_id
        and product.user_id = current_user_id
        and product.workspace_id = p_workspace_id
      group by item.product_id, product.name
      having sum(
        greatest(
          item.quantity
          - least(
              item.quantity,
              coalesce(returned.quantity, 0)
            ),
          0
        )
      ) > 0
    ),

    series_source as (
      select
        case
          when p_period = 'month'
            then to_char(sale.sale_date::date, 'YYYY-MM-DD')
          else to_char(sale.sale_date::date, 'YYYY-MM')
        end as key,
        sale.revenue,
        sale.profit,
        0::numeric as expenses
      from realized_financials sale

      union all

      select
        case
          when p_period = 'month'
            then to_char(expense.spent_at::date, 'YYYY-MM-DD')
          else to_char(expense.spent_at::date, 'YYYY-MM')
        end as key,
        0::numeric as revenue,
        0::numeric as profit,
        expense.amount as expenses
      from period_expenses expense
    ),

    series_aggregated as (
      select
        source.key,
        coalesce(sum(source.revenue), 0) as revenue,
        coalesce(sum(source.profit), 0) as profit,
        coalesce(sum(source.expenses), 0) as expenses
      from series_source source
      group by source.key
    ),

    series_keys as (
      select
        to_char(day_value::date, 'YYYY-MM-DD') as key
      from generate_series(
        range_start::timestamp,
        range_end::timestamp,
        interval '1 day'
      ) day_value
      where p_period = 'month'

      union

      select
        to_char(month_value::date, 'YYYY-MM') as key
      from generate_series(
        date_trunc('month', range_start::timestamp),
        date_trunc('month', range_end::timestamp),
        interval '1 month'
      ) month_value
      where p_period in ('3m', '6m', '12m')

      union

      select aggregated.key
      from series_aggregated aggregated
      where p_period = 'all'

      union

      select to_char(range_end, 'YYYY-MM')
      where p_period = 'all'
        and not exists (
          select 1
          from series_aggregated
        )
    ),

    series_rows as (
      select
        keys.key,
        case
          when p_period = 'month' then
            substring(keys.key from 9 for 2)
            || '/'
            || substring(keys.key from 6 for 2)
          else
            case substring(keys.key from 6 for 2)
              when '01' then 'jan'
              when '02' then 'fev'
              when '03' then 'mar'
              when '04' then 'abr'
              when '05' then 'mai'
              when '06' then 'jun'
              when '07' then 'jul'
              when '08' then 'ago'
              when '09' then 'set'
              when '10' then 'out'
              when '11' then 'nov'
              else 'dez'
            end
        end as label,
        round(
          coalesce(aggregated.revenue, 0)::numeric,
          2
        ) as revenue,
        round(
          coalesce(aggregated.profit, 0)::numeric,
          2
        ) as profit,
        round(
          coalesce(aggregated.expenses, 0)::numeric,
          2
        ) as expenses,
        round(
          (
            coalesce(aggregated.profit, 0)
            - coalesce(aggregated.expenses, 0)
          )::numeric,
          2
        ) as result
      from series_keys keys
      left join series_aggregated aggregated
        on aggregated.key = keys.key
    )

    select jsonb_build_object(
      'summary',
      (
        select jsonb_build_object(
          'revenue',
          round(summary.revenue::numeric, 2),
          'saleProfit',
          round(summary.sale_profit::numeric, 2),
          'expenses',
          round(summary.expenses::numeric, 2),
          'result',
          round(
            (
              summary.sale_profit
              - summary.expenses
            )::numeric,
            2
          ),
          'margin',
          case
            when summary.revenue > 0 then
              (
                (
                  summary.sale_profit
                  - summary.expenses
                )
                / summary.revenue
              ) * 100
            else 0
          end,
          'salesCount',
          summary.sales_count,
          'ticket',
          case
            when summary.sales_count > 0 then
              round(
                (
                  summary.revenue
                  / summary.sales_count
                )::numeric,
                2
              )
            else 0
          end,
          'received',
          round(summary.received::numeric, 2),
          'receivable',
          round(summary.receivable::numeric, 2)
        )
        from summary_values summary
      ),

      'series',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'key', row.key,
              'label', row.label,
              'revenue', row.revenue,
              'profit', row.profit,
              'expenses', row.expenses,
              'result', row.result
            )
            order by row.key
          )
          from series_rows row
        ),
        '[]'::jsonb
      ),

      'expensesByCategory',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'category', row.category,
              'label', row.label,
              'value', row.value
            )
            order by row.value desc
          )
          from expense_categories row
        ),
        '[]'::jsonb
      ),

      'topByRevenue',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'productId', ranked.product_id,
              'name', ranked.name,
              'units', ranked.units,
              'revenue', round(ranked.revenue::numeric, 2),
              'profit', round(ranked.profit::numeric, 2)
            )
            order by ranked.revenue desc
          )
          from (
            select *
            from product_values
            order by revenue desc
            limit 5
          ) ranked
        ),
        '[]'::jsonb
      ),

      'topByProfit',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'productId', ranked.product_id,
              'name', ranked.name,
              'units', ranked.units,
              'revenue', round(ranked.revenue::numeric, 2),
              'profit', round(ranked.profit::numeric, 2)
            )
            order by ranked.profit desc
          )
          from (
            select *
            from product_values
            order by profit desc
            limit 5
          ) ranked
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke execute on function public.get_business_reports_analytics(
  uuid, text, date
) from public, anon;

grant execute on function public.get_business_reports_analytics(
  uuid, text, date
) to authenticated;



-- Delivery-aware customer 360.
-- Customer 360: complete customer commercial relationship read model.

create index if not exists idx_business_payments_workspace_sale_status
  on public.business_payments(user_id, workspace_id, sale_id, status);

create index if not exists idx_business_returns_workspace_sale_created
  on public.business_sale_returns(user_id, workspace_id, sale_id, created_at desc);

create or replace function public.get_business_customer_360(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_page integer := greatest(coalesce(p_page, 1), 1);
  resolved_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 100);
  customer_row public.business_customers%rowtype;
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  select *
  into customer_row
  from public.business_customers customer
  where customer.id = p_customer_id
    and customer.user_id = current_user_id
    and customer.workspace_id = p_workspace_id;

  if not found then
    raise exception 'Cliente nao encontrado';
  end if;

  with customer_sales as (
    select
      sale.id,
      sale.sale_number,
      sale.order_status,
      sale.payment_status,
      sale.sale_date,
      sale.delivered_at,
      sale.notes,
      sale.created_at,
      sale.delivery_fee,
      sale.delivery_cost
    from public.business_sales sale
    where sale.user_id = current_user_id
      and sale.workspace_id = p_workspace_id
      and sale.customer_id = p_customer_id
  ),

  return_quantity_by_item as (
    select
      return_item.sale_item_id,
      coalesce(sum(return_item.quantity), 0)::integer as returned_quantity,
      coalesce(
        sum(return_item.quantity) filter (
          where return_item.restockable
        ),
        0
      )::integer as restockable_quantity
    from public.business_sale_return_items return_item
    join public.business_sale_items sale_item
      on sale_item.id = return_item.sale_item_id
     and sale_item.user_id = current_user_id
     and sale_item.workspace_id = p_workspace_id
    join customer_sales sale
      on sale.id = sale_item.sale_id
    where return_item.user_id = current_user_id
      and return_item.workspace_id = p_workspace_id
    group by return_item.sale_item_id
  ),

  item_financials as (
    select
      item.sale_id,
      coalesce(sum(item.final_amount), 0) as gross_revenue,
      coalesce(sum(item.net_profit), 0) as base_profit,
      coalesce(
        sum(
          case
            when item.quantity <= 0 then 0
            else (
              item.cogs_amount / item.quantity
            ) * least(
              item.quantity,
              coalesce(return_quantity.restockable_quantity, 0)
            )
          end
        ),
        0
      ) as recovered_cogs
    from public.business_sale_items item
    join customer_sales sale
      on sale.id = item.sale_id
    left join return_quantity_by_item return_quantity
      on return_quantity.sale_item_id = item.id
    where item.user_id = current_user_id
      and item.workspace_id = p_workspace_id
    group by item.sale_id
  ),

  return_financials as (
    select
      sale_return.sale_id,
      coalesce(sum(sale_return.refund_amount), 0) as refunds,
      count(*)::integer as returns_count
    from public.business_sale_returns sale_return
    join customer_sales sale
      on sale.id = sale_return.sale_id
    where sale_return.user_id = current_user_id
      and sale_return.workspace_id = p_workspace_id
    group by sale_return.sale_id
  ),

  payment_financials as (
    select
      payment.sale_id,
      coalesce(
        sum(payment.amount) filter (
          where payment.status = 'PAID'
        ),
        0
      ) as paid_total,
      coalesce(
        sum(payment.amount) filter (
          where payment.status = 'REFUNDED'
        ),
        0
      ) as refunded_total
    from public.business_payments payment
    join customer_sales sale
      on sale.id = payment.sale_id
    where payment.user_id = current_user_id
      and payment.workspace_id = p_workspace_id
    group by payment.sale_id
  ),

  sale_financials as (
    select
      sale.id,
      sale.sale_number,
      sale.order_status,
      sale.payment_status,
      sale.sale_date,
      sale.delivered_at,
      sale.notes,
      sale.created_at,

      round(
        coalesce(item_financial.gross_revenue, 0) +
        coalesce(sale.delivery_fee, 0),
        2
      ) as gross_revenue,

      round(
        coalesce(return_financial.refunds, 0),
        2
      ) as refunded_amount,

      greatest(
        round(
          coalesce(item_financial.gross_revenue, 0) +
          coalesce(sale.delivery_fee, 0) -
          coalesce(return_financial.refunds, 0),
          2
        ),
        0
      ) as net_revenue,

      round(
        coalesce(payment_financial.paid_total, 0),
        2
      ) as paid_total,

      round(
        coalesce(payment_financial.refunded_total, 0),
        2
      ) as refunded_payments,

      greatest(
        round(
          coalesce(payment_financial.paid_total, 0) -
          coalesce(payment_financial.refunded_total, 0),
          2
        ),
        0
      ) as net_paid,

      greatest(
        round(
          greatest(
            coalesce(item_financial.gross_revenue, 0) +
            coalesce(sale.delivery_fee, 0) -
            coalesce(return_financial.refunds, 0),
            0
          ) - (
            coalesce(payment_financial.paid_total, 0) -
            coalesce(payment_financial.refunded_total, 0)
          ),
          2
        ),
        0
      ) as remaining_amount,

      round(
        coalesce(item_financial.base_profit, 0) +
        coalesce(sale.delivery_fee, 0) -
        coalesce(sale.delivery_cost, 0) -
        coalesce(return_financial.refunds, 0) +
        coalesce(item_financial.recovered_cogs, 0),
        2
      ) as net_profit,

      coalesce(
        return_financial.returns_count,
        0
      )::integer as returns_count

    from customer_sales sale
    left join item_financials item_financial
      on item_financial.sale_id = sale.id
    left join return_financials return_financial
      on return_financial.sale_id = sale.id
    left join payment_financials payment_financial
      on payment_financial.sale_id = sale.id
  ),

  valid_sales as (
    select *
    from sale_financials
    where order_status not in ('DRAFT', 'CANCELLED')
  ),

  customer_summary as (
    select
      count(*)::integer as orders,

      count(*) filter (
        where order_status in ('DELIVERED', 'RETURNED')
      )::integer as realized_orders,

      coalesce(sum(net_revenue), 0) as total_purchased,

      coalesce(sum(net_paid), 0) as total_paid,

      coalesce(sum(remaining_amount), 0) as open_balance,

      coalesce(sum(refunded_amount), 0) as total_refunded,

      coalesce(
        sum(net_profit) filter (
          where order_status in ('DELIVERED', 'RETURNED')
        ),
        0
      ) as realized_profit,

      max(sale_date) as last_purchase

    from valid_sales
  ),

  product_metrics as (
    select
      product.id,
      product.name,
      product.sku,
      product.barcode,
      product.image_url,

      coalesce(sum(item.quantity), 0)::integer as purchased_quantity,

      coalesce(
        sum(
          coalesce(return_quantity.returned_quantity, 0)
        ),
        0
      )::integer as returned_quantity,

      greatest(
        coalesce(sum(item.quantity), 0) -
        coalesce(
          sum(
            coalesce(return_quantity.returned_quantity, 0)
          ),
          0
        ),
        0
      )::integer as net_quantity,

      count(distinct item.sale_id)::integer as orders_count,

      round(
        coalesce(sum(item.final_amount), 0),
        2
      ) as gross_value

    from public.business_sale_items item
    join valid_sales sale
      on sale.id = item.sale_id
    join public.business_products product
      on product.id = item.product_id
     and product.user_id = current_user_id
     and product.workspace_id = p_workspace_id
    left join return_quantity_by_item return_quantity
      on return_quantity.sale_item_id = item.id

    where item.user_id = current_user_id
      and item.workspace_id = p_workspace_id

    group by
      product.id,
      product.name,
      product.sku,
      product.barcode,
      product.image_url
  ),

  top_products as (
    select *
    from product_metrics
    order by
      net_quantity desc,
      orders_count desc,
      gross_value desc,
      name asc
    limit 10
  ),

  payment_history as (
    select
      payment.id,
      payment.sale_id,
      sale.sale_number,
      payment.amount,
      payment.payment_method,
      payment.status,
      payment.paid_at,
      payment.notes,
      payment.created_at
    from public.business_payments payment
    join customer_sales sale
      on sale.id = payment.sale_id
    where payment.user_id = current_user_id
      and payment.workspace_id = p_workspace_id
    order by
      coalesce(payment.paid_at, payment.created_at) desc,
      payment.id desc
  ),

  return_history as (
    select
      sale_return.id,
      sale_return.sale_id,
      sale.sale_number,
      sale_return.refund_amount,
      sale_return.notes,
      sale_return.created_at,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', return_item.id,
              'sale_item_id', return_item.sale_item_id,
              'product_id', return_item.product_id,
              'product_name', product.name,
              'sku', product.sku,
              'quantity', return_item.quantity,
              'restockable', return_item.restockable
            )
            order by return_item.created_at asc
          )
          from public.business_sale_return_items return_item
          join public.business_products product
            on product.id = return_item.product_id
           and product.user_id = current_user_id
           and product.workspace_id = p_workspace_id
          where return_item.return_id = sale_return.id
            and return_item.user_id = current_user_id
            and return_item.workspace_id = p_workspace_id
        ),
        '[]'::jsonb
      ) as items
    from public.business_sale_returns sale_return
    join customer_sales sale
      on sale.id = sale_return.sale_id
    where sale_return.user_id = current_user_id
      and sale_return.workspace_id = p_workspace_id
    order by sale_return.created_at desc, sale_return.id desc
  ),

  sales_count as (
    select count(*)::integer as total_count
    from sale_financials
  ),

  sales_page as (
    select *
    from sale_financials
    order by sale_date desc, created_at desc, id desc
    offset (resolved_page - 1) * resolved_page_size
    limit resolved_page_size
  )

  select jsonb_build_object(
    'customer',
    jsonb_build_object(
      'id', customer_row.id,
      'name', customer_row.name,
      'whatsapp', customer_row.whatsapp,
      'notes', customer_row.notes,
      'created_at', customer_row.created_at,
      'updated_at', customer_row.updated_at
    ),

    'summary',
    jsonb_build_object(
      'orders',
      coalesce((select orders from customer_summary), 0),

      'realized_orders',
      coalesce((select realized_orders from customer_summary), 0),

      'total_purchased',
      round(
        coalesce(
          (select total_purchased from customer_summary),
          0
        ),
        2
      ),

      'total_paid',
      round(
        coalesce(
          (select total_paid from customer_summary),
          0
        ),
        2
      ),

      'open_balance',
      round(
        coalesce(
          (select open_balance from customer_summary),
          0
        ),
        2
      ),

      'ticket_average',
      case
        when coalesce(
          (select orders from customer_summary),
          0
        ) > 0
        then round(
          (
            select total_purchased
            from customer_summary
          ) /
          (
            select orders
            from customer_summary
          ),
          2
        )
        else 0
      end,

      'total_refunded',
      round(
        coalesce(
          (select total_refunded from customer_summary),
          0
        ),
        2
      ),

      'realized_profit',
      round(
        coalesce(
          (select realized_profit from customer_summary),
          0
        ),
        2
      ),

      'last_purchase',
      (select last_purchase from customer_summary),

      'customer_since',
      customer_row.created_at
    ),

    'top_products',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(top_products)
          order by
            net_quantity desc,
            orders_count desc,
            gross_value desc,
            name asc
        )
        from top_products
      ),
      '[]'::jsonb
    ),

    'payments',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(payment_history)
          order by
            coalesce(paid_at, created_at) desc,
            id desc
        )
        from payment_history
      ),
      '[]'::jsonb
    ),

    'returns',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(return_history)
          order by created_at desc, id desc
        )
        from return_history
      ),
      '[]'::jsonb
    ),

    'sales',
    jsonb_build_object(
      'rows',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(sales_page)
            order by sale_date desc, created_at desc, id desc
          )
          from sales_page
        ),
        '[]'::jsonb
      ),

      'total_count',
      (select total_count from sales_count),

      'page',
      resolved_page,

      'page_size',
      resolved_page_size,

      'total_pages',
      case
        when (select total_count from sales_count) = 0
          then 0
        else ceil(
          (select total_count from sales_count)::numeric /
          resolved_page_size
        )::integer
      end
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_business_customer_360(
  uuid,
  uuid,
  integer,
  integer
) from public;

grant execute on function public.get_business_customer_360(
  uuid,
  uuid,
  integer,
  integer
) to authenticated;


-- Delivery-aware customers page.
create or replace function public.get_business_customers_page(
  p_workspace_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_page integer := greatest(coalesce(p_page, 1), 1);
  resolved_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  return (
    with gross_by_sale as (
      select
        sale.id as sale_id,
        sale.customer_id,
        sale.sale_date,
        coalesce(sum(item.final_amount), 0) + coalesce(max(sale.delivery_fee), 0) as gross_value
      from public.business_sales sale
      left join public.business_sale_items item
        on item.sale_id = sale.id
        and item.user_id = current_user_id
        and item.workspace_id = p_workspace_id
      where sale.user_id = current_user_id
        and sale.workspace_id = p_workspace_id
        and sale.customer_id is not null
        and sale.order_status <> 'CANCELLED'
      group by sale.id, sale.customer_id, sale.sale_date
    ),
    refunds_by_sale as (
      select
        sale_return.sale_id,
        coalesce(sum(sale_return.refund_amount), 0) as refund_value
      from public.business_sale_returns sale_return
      where sale_return.user_id = current_user_id
        and sale_return.workspace_id = p_workspace_id
      group by sale_return.sale_id
    ),
    sale_financials as (
      select
        sale.sale_id,
        sale.customer_id,
        sale.sale_date,
        greatest(
          sale.gross_value - coalesce(refund.refund_value, 0),
          0
        ) as net_value
      from gross_by_sale sale
      left join refunds_by_sale refund
        on refund.sale_id = sale.sale_id
    ),
    customer_metrics as (
      select
        sale.customer_id,
        count(*)::integer as orders,
        coalesce(sum(sale.net_value), 0) as total_purchased,
        max(sale.sale_date) as last_purchase
      from sale_financials sale
      group by sale.customer_id
    ),
    base as (
      select
        customer.id,
        customer.user_id,
        customer.workspace_id,
        customer.name,
        customer.whatsapp,
        customer.notes,
        customer.created_at,
        customer.updated_at,
        coalesce(metrics.orders, 0)::integer as orders,
        coalesce(metrics.total_purchased, 0) as total_purchased,
        metrics.last_purchase
      from public.business_customers customer
      left join customer_metrics metrics
        on metrics.customer_id = customer.id
      where customer.user_id = current_user_id
        and customer.workspace_id = p_workspace_id
    ),
    filtered as (
      select *
      from base
      where nullif(trim(coalesce(p_search, '')), '') is null
        or position(
          lower(trim(p_search))
          in lower(
            coalesce(name, '') || ' ' ||
            coalesce(whatsapp, '') || ' ' ||
            coalesce(notes, '')
          )
        ) > 0
    ),
    counts as (
      select count(*)::integer as total_count
      from filtered
    ),
    page_rows as (
      select *
      from filtered
      order by created_at desc, id desc
      offset (resolved_page - 1) * resolved_page_size
      limit resolved_page_size
    ),
    summary as (
      select
        count(*)::integer as total,
        count(*) filter (where orders > 0)::integer as buyers,
        count(*) filter (where orders >= 2)::integer as recurring,
        coalesce(sum(total_purchased), 0) as total_sold
      from base
    )
    select jsonb_build_object(
      'rows',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(page_rows)
            order by created_at desc, id desc
          )
          from page_rows
        ),
        '[]'::jsonb
      ),
      'total_count',
      (select total_count from counts),
      'page',
      resolved_page,
      'page_size',
      resolved_page_size,
      'total_pages',
      case
        when (select total_count from counts) = 0 then 0
        else ceil(
          (select total_count from counts)::numeric /
          resolved_page_size
        )::integer
      end,
      'summary',
      jsonb_build_object(
        'total', (select total from summary),
        'buyers', (select buyers from summary),
        'recurring', (select recurring from summary),
        'total_sold', (select total_sold from summary)
      )
    )
  );
end;
$$;

revoke execute on function public.get_business_customers_page(uuid, integer, integer, text) from public, anon;
grant execute on function public.get_business_customers_page(uuid, integer, integer, text) to authenticated;
