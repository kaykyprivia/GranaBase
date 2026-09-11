alter table public.consortiums
  add column if not exists initial_paid_installments integer not null default 0,
  add column if not exists initial_paid_amount numeric(14,2) not null default 0,
  add column if not exists due_day integer;

update public.consortiums
set due_day = extract(day from first_due_date)::integer
where due_day is null;

alter table public.consortiums
  alter column due_day set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'consortiums_initial_paid_installments_check'
  ) then
    alter table public.consortiums
      add constraint consortiums_initial_paid_installments_check
      check (
        initial_paid_installments >= 0
        and initial_paid_installments < total_installments
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'consortiums_initial_paid_amount_check'
  ) then
    alter table public.consortiums
      add constraint consortiums_initial_paid_amount_check
      check (initial_paid_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'consortiums_due_day_check'
  ) then
    alter table public.consortiums
      add constraint consortiums_due_day_check
      check (due_day between 1 and 31);
  end if;
end
$$;


create or replace function public.create_consortium_v2(
  p_name text,
  p_holder_name text,
  p_credit_amount numeric,
  p_total_installments integer,
  p_current_installment_amount numeric,
  p_current_installment_number integer,
  p_current_due_date date,
  p_initial_paid_amount numeric default 0,
  p_due_day integer default null,
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
  current_payment_id uuid;

  resolved_due_day integer;
  initial_paid_count integer;

  first_month_start date;
  first_month_last_day integer;
  derived_first_due_date date;
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

  if p_credit_amount is null or p_credit_amount <= 0 then
    raise exception 'Valor da carta deve ser maior que zero';
  end if;

  if p_total_installments is null or p_total_installments <= 0 then
    raise exception 'Quantidade total de parcelas invalida';
  end if;

  if (
    p_current_installment_number is null
    or p_current_installment_number <= 0
    or p_current_installment_number > p_total_installments
  ) then
    raise exception 'Parcela atual invalida';
  end if;

  if (
    p_current_installment_amount is null
    or p_current_installment_amount <= 0
  ) then
    raise exception 'Valor da parcela deve ser maior que zero';
  end if;

  if p_current_due_date is null then
    raise exception 'Vencimento atual obrigatorio';
  end if;

  if p_initial_paid_amount is null or p_initial_paid_amount < 0 then
    raise exception 'Capital ja pago invalido';
  end if;

  resolved_due_day :=
    coalesce(
      p_due_day,
      extract(day from p_current_due_date)::integer
    );

  if resolved_due_day < 1 or resolved_due_day > 31 then
    raise exception 'Dia de vencimento invalido';
  end if;

  initial_paid_count := p_current_installment_number - 1;

  first_month_start := (
    date_trunc('month', p_current_due_date)::date
    - make_interval(months => initial_paid_count)
  )::date;

  first_month_last_day :=
    extract(
      day from (
        (first_month_start + interval '1 month')
        - interval '1 day'
      )
    )::integer;

  derived_first_due_date :=
    first_month_start
    + (least(resolved_due_day, first_month_last_day) - 1);

  insert into public.consortiums (
    user_id,
    name,
    holder_name,
    administrator,
    credit_amount,
    total_installments,
    current_installment_amount,
    first_due_date,
    initial_paid_installments,
    initial_paid_amount,
    due_day,
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
    derived_first_due_date,
    initial_paid_count,
    p_initial_paid_amount,
    resolved_due_day,
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
    p_current_installment_number,
    p_current_due_date,
    p_current_installment_amount
  )
  returning id into current_payment_id;

  return jsonb_build_object(
    'consortium_id', new_consortium_id,
    'current_payment_id', current_payment_id,
    'current_installment_number', p_current_installment_number,
    'initial_paid_installments', initial_paid_count
  );
end;
$$;

revoke all on function public.create_consortium_v2(
  text,
  text,
  numeric,
  integer,
  numeric,
  integer,
  date,
  numeric,
  integer,
  text,
  numeric,
  numeric,
  text
) from public;

grant execute on function public.create_consortium_v2(
  text,
  text,
  numeric,
  integer,
  numeric,
  integer,
  date,
  numeric,
  integer,
  text,
  numeric,
  numeric,
  text
) to authenticated;


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
      when p_paid_amount < payment_row.amount
        then 'paid_with_discount'
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
    next_installment_number :=
      payment_row.installment_number + 1;

    target_month_start := (
      date_trunc('month', payment_row.due_date)::date
      + interval '1 month'
    )::date;

    target_month_last_day :=
      extract(
        day from (
          (target_month_start + interval '1 month')
          - interval '1 day'
        )
      )::integer;

    next_due_date :=
      target_month_start
      + (
        least(consortium_row.due_day, target_month_last_day)
        - 1
      );

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
    on conflict (consortium_id, installment_number)
    do nothing
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

revoke all on function public.pay_consortium_payment(
  uuid,
  numeric,
  text
) from public;

grant execute on function public.pay_consortium_payment(
  uuid,
  numeric,
  text
) to authenticated;

-- ============================================================
-- BACKWARD COMPATIBILITY: create_consortium
-- Keeps the production/older client functional after due_day
-- becomes NOT NULL. New clients use create_consortium_v2.
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

  if p_credit_amount is null or p_credit_amount <= 0 then
    raise exception 'Valor da carta deve ser maior que zero';
  end if;

  if p_total_installments is null or p_total_installments <= 0 then
    raise exception 'Quantidade de parcelas deve ser maior que zero';
  end if;

  if (
    p_current_installment_amount is null
    or p_current_installment_amount <= 0
  ) then
    raise exception 'Valor da parcela deve ser maior que zero';
  end if;

  if p_first_due_date is null then
    raise exception 'Primeiro vencimento obrigatorio';
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
    initial_paid_installments,
    initial_paid_amount,
    due_day,
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
    0,
    0,
    extract(day from p_first_due_date)::integer,
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
  text,
  text,
  numeric,
  integer,
  numeric,
  date,
  text,
  numeric,
  numeric,
  text
) from public;

grant execute on function public.create_consortium(
  text,
  text,
  numeric,
  integer,
  numeric,
  date,
  text,
  numeric,
  numeric,
  text
) to authenticated;

