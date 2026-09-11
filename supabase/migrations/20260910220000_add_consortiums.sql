create table if not exists public.consortiums (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  name                        text not null,
  holder_name                 text not null,
  administrator               text,
  credit_amount               numeric(14,2) not null check (credit_amount > 0),
  total_installments          integer not null check (total_installments > 0),
  current_installment_amount  numeric(12,2) not null check (current_installment_amount > 0),
  first_due_date              date not null,
  status                      text not null default 'active'
                              check (status in ('active', 'completed', 'cancelled')),
  contemplated                boolean not null default false,
  contemplated_at             date,
  bid_amount                  numeric(14,2) check (bid_amount is null or bid_amount >= 0),
  administration_fee_percent  numeric(7,4)
                              check (
                                administration_fee_percent is null
                                or administration_fee_percent >= 0
                              ),
  reserve_fund_percent        numeric(7,4)
                              check (
                                reserve_fund_percent is null
                                or reserve_fund_percent >= 0
                              ),
  notes                       text,
  created_at                  timestamptz not null default now(),

  constraint consortiums_contemplation_date_check
    check (contemplated = true or contemplated_at is null),

  unique (id, user_id)
);

alter table public.consortiums enable row level security;

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where tablename = 'consortiums'
      and policyname = 'users can select own consortiums'
  ) then
    create policy "users can select own consortiums"
      on public.consortiums
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where tablename = 'consortiums'
      and policyname = 'users can insert own consortiums'
  ) then
    create policy "users can insert own consortiums"
      on public.consortiums
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where tablename = 'consortiums'
      and policyname = 'users can update own consortiums'
  ) then
    create policy "users can update own consortiums"
      on public.consortiums
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where tablename = 'consortiums'
      and policyname = 'users can delete own consortiums'
  ) then
    create policy "users can delete own consortiums"
      on public.consortiums
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_consortiums_user_status
  on public.consortiums(user_id, status);

create index if not exists idx_consortiums_user_first_due
  on public.consortiums(user_id, first_due_date);


create table if not exists public.consortium_payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  consortium_id       uuid not null,
  installment_number  integer not null check (installment_number > 0),
  due_date            date not null,
  amount              numeric(12,2) not null check (amount > 0),
  status              text not null default 'pending'
                      check (status in ('pending', 'paid', 'paid_with_discount')),
  paid_amount         numeric(12,2)
                      check (paid_amount is null or paid_amount >= 0),
  paid_at             timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),

  constraint consortium_payments_owner_fkey
    foreign key (consortium_id, user_id)
    references public.consortiums(id, user_id)
    on delete cascade,

  constraint consortium_payments_paid_state_check
    check (
      (status = 'pending' and paid_at is null)
      or
      (status in ('paid', 'paid_with_discount') and paid_at is not null)
    ),

  unique (consortium_id, installment_number)
);

alter table public.consortium_payments enable row level security;

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where tablename = 'consortium_payments'
      and policyname = 'users can select own consortium payments'
  ) then
    create policy "users can select own consortium payments"
      on public.consortium_payments
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where tablename = 'consortium_payments'
      and policyname = 'users can insert own consortium payments'
  ) then
    create policy "users can insert own consortium payments"
      on public.consortium_payments
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where tablename = 'consortium_payments'
      and policyname = 'users can update own consortium payments'
  ) then
    create policy "users can update own consortium payments"
      on public.consortium_payments
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where tablename = 'consortium_payments'
      and policyname = 'users can delete own consortium payments'
  ) then
    create policy "users can delete own consortium payments"
      on public.consortium_payments
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_consortium_payments_consortium
  on public.consortium_payments(consortium_id, installment_number);

create index if not exists idx_consortium_payments_user_due
  on public.consortium_payments(user_id, due_date);

create index if not exists idx_consortium_payments_user_status_due
  on public.consortium_payments(user_id, status, due_date);

-- ============================================================
-- RPC: create_consortium
-- Creates the consortium and only its first installment.
-- ============================================================

create or replace function public.create_consortium(
  p_name text,
  p_holder_name text,
  p_credit_amount numeric,
  p_total_installments integer,
  p_current_installment_amount numeric,
  p_first_due_date date,
  p_administrator text default null,
  p_administration_fee_percent numeric default null,
  p_reserve_fund_percent numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_consortium_id uuid;
  first_payment_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Nome do consorcio obrigatorio';
  end if;

  if nullif(trim(p_holder_name), '') is null then
    raise exception 'Titular obrigatorio';
  end if;

  if p_credit_amount <= 0 then
    raise exception 'Valor da carta deve ser maior que zero';
  end if;

  if p_total_installments <= 0 then
    raise exception 'Quantidade de parcelas deve ser maior que zero';
  end if;

  if p_current_installment_amount <= 0 then
    raise exception 'Valor da parcela deve ser maior que zero';
  end if;

  insert into public.consortiums (
    user_id,
    name,
    holder_name,
    administrator,
    credit_amount,
    total_installments,
    current_installment_amount,
    first_due_date,
    administration_fee_percent,
    reserve_fund_percent,
    notes
  )
  values (
    current_user_id,
    trim(p_name),
    trim(p_holder_name),
    nullif(trim(p_administrator), ''),
    p_credit_amount,
    p_total_installments,
    p_current_installment_amount,
    p_first_due_date,
    p_administration_fee_percent,
    p_reserve_fund_percent,
    nullif(trim(p_notes), '')
  )
  returning id into new_consortium_id;

  insert into public.consortium_payments (
    user_id,
    consortium_id,
    installment_number,
    due_date,
    amount
  )
  values (
    current_user_id,
    new_consortium_id,
    1,
    p_first_due_date,
    p_current_installment_amount
  )
  returning id into first_payment_id;

  return jsonb_build_object(
    'consortium_id', new_consortium_id,
    'first_payment_id', first_payment_id
  );
end;
$$;

revoke all on function public.create_consortium(
  text, text, numeric, integer, numeric, date, text, numeric, numeric, text
) from public;

grant execute on function public.create_consortium(
  text, text, numeric, integer, numeric, date, text, numeric, numeric, text
) to authenticated;


-- ============================================================
-- RPC: pay_consortium_payment
-- Marks one installment as paid and creates only the next one.
-- ============================================================

create or replace function public.pay_consortium_payment(
  p_payment_id uuid,
  p_paid_amount numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  payment_row public.consortium_payments%rowtype;
  consortium_row public.consortiums%rowtype;
  next_payment_id uuid;
  next_installment_number integer;
  next_due_date date;
  target_month_start date;
  target_month_last_day integer;
  original_due_day integer;
  payment_status text;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into payment_row
  from public.consortium_payments
  where id = p_payment_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Parcela nao encontrada';
  end if;

  if payment_row.status <> 'pending' then
    raise exception 'Parcela ja foi paga';
  end if;

  if p_paid_amount is null or p_paid_amount <= 0 then
    raise exception 'Valor pago deve ser maior que zero';
  end if;

  if p_paid_amount > payment_row.amount then
    raise exception 'Valor pago nao pode ser maior que o valor da parcela';
  end if;

  select *
    into consortium_row
  from public.consortiums
  where id = payment_row.consortium_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Consorcio nao encontrado';
  end if;

  payment_status :=
    case
      when p_paid_amount < payment_row.amount then 'paid_with_discount'
      else 'paid'
    end;

  update public.consortium_payments
  set
    status = payment_status,
    paid_amount = p_paid_amount,
    paid_at = now(),
    notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = payment_row.id;

  if payment_row.installment_number >= consortium_row.total_installments then
    update public.consortiums
    set status = 'completed'
    where id = consortium_row.id;

    return jsonb_build_object(
      'payment_id', payment_row.id,
      'status', payment_status,
      'consortium_completed', true
    );
  end if;

  if consortium_row.status = 'active' then
    next_installment_number := payment_row.installment_number + 1;

    target_month_start := (
      date_trunc('month', consortium_row.first_due_date)::date
      + make_interval(months => payment_row.installment_number)
    )::date;

    original_due_day :=
      extract(day from consortium_row.first_due_date)::integer;

    target_month_last_day :=
      extract(
        day from (
          (target_month_start + interval '1 month')
          - interval '1 day'
        )
      )::integer;

    next_due_date :=
      target_month_start
      + (least(original_due_day, target_month_last_day) - 1);

    insert into public.consortium_payments (
      user_id,
      consortium_id,
      installment_number,
      due_date,
      amount
    )
    values (
      current_user_id,
      consortium_row.id,
      next_installment_number,
      next_due_date,
      consortium_row.current_installment_amount
    )
    on conflict (consortium_id, installment_number) do nothing
    returning id into next_payment_id;
  end if;

  return jsonb_build_object(
    'payment_id', payment_row.id,
    'status', payment_status,
    'next_payment_id', next_payment_id,
    'consortium_completed', false
  );
end;
$$;

revoke all on function public.pay_consortium_payment(uuid, numeric, text)
from public;

grant execute on function public.pay_consortium_payment(uuid, numeric, text)
to authenticated;

