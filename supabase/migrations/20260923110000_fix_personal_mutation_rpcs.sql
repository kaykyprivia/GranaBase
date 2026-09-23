-- ============================================================
-- Corrige RPCs do Personal desalinhadas com o schema real
-- - bills: usa "name" (não "description"), inclui is_recurring/paid_at
-- - financial_goals: remove current_amount inexistente, inclui status
-- - installments: usa installment_count/installment_amount/first_due_date
-- ============================================================

-- ===================== BILLS =====================

create or replace function public.create_bill(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  insert into public.bills (
    user_id, name, amount, due_date, category, status, is_recurring, paid_at, notes
  )
  values (
    current_user_id,
    p_payload->>'name',
    (p_payload->>'amount')::numeric,
    (p_payload->>'due_date')::date,
    p_payload->>'category',
    coalesce(p_payload->>'status', 'pending'),
    coalesce((p_payload->>'is_recurring')::boolean, false),
    case when p_payload ? 'paid_at' then (p_payload->>'paid_at')::timestamptz else null end,
    p_payload->>'notes'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_bill(jsonb) from public, anon;
grant execute on function public.create_bill(jsonb) to authenticated;

create or replace function public.update_bill(p_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  update public.bills
  set
    name = coalesce(p_payload->>'name', name),
    amount = coalesce((p_payload->>'amount')::numeric, amount),
    due_date = coalesce((p_payload->>'due_date')::date, due_date),
    category = coalesce(p_payload->>'category', category),
    status = coalesce(p_payload->>'status', status),
    is_recurring = coalesce((p_payload->>'is_recurring')::boolean, is_recurring),
    paid_at = case when p_payload ? 'paid_at' then (p_payload->>'paid_at')::timestamptz else paid_at end,
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Conta nao encontrada';
  end if;
end;
$$;

revoke all on function public.update_bill(uuid, jsonb) from public, anon;
grant execute on function public.update_bill(uuid, jsonb) to authenticated;

-- ===================== FINANCIAL GOALS =====================

create or replace function public.create_financial_goal(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  insert into public.financial_goals (
    user_id, name, target_amount, deadline, category, status, notes
  )
  values (
    current_user_id,
    p_payload->>'name',
    (p_payload->>'target_amount')::numeric,
    case when p_payload ? 'deadline' then (p_payload->>'deadline')::date else null end,
    p_payload->>'category',
    coalesce(p_payload->>'status', 'active'),
    p_payload->>'notes'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_financial_goal(jsonb) from public, anon;
grant execute on function public.create_financial_goal(jsonb) to authenticated;

create or replace function public.update_financial_goal(p_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  update public.financial_goals
  set
    name = coalesce(p_payload->>'name', name),
    target_amount = coalesce((p_payload->>'target_amount')::numeric, target_amount),
    deadline = case when p_payload ? 'deadline' then (p_payload->>'deadline')::date else deadline end,
    category = coalesce(p_payload->>'category', category),
    status = coalesce(p_payload->>'status', status),
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Meta nao encontrada';
  end if;
end;
$$;

revoke all on function public.update_financial_goal(uuid, jsonb) from public, anon;
grant execute on function public.update_financial_goal(uuid, jsonb) to authenticated;

-- ===================== INSTALLMENTS =====================

create or replace function public.create_installment(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  insert into public.installments (
    user_id, description, total_amount, installment_count,
    installment_amount, first_due_date, category, payment_method, notes
  )
  values (
    current_user_id,
    p_payload->>'description',
    (p_payload->>'total_amount')::numeric,
    (p_payload->>'installment_count')::integer,
    (p_payload->>'installment_amount')::numeric,
    (p_payload->>'first_due_date')::date,
    p_payload->>'category',
    p_payload->>'payment_method',
    p_payload->>'notes'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_installment(jsonb) from public, anon;
grant execute on function public.create_installment(jsonb) to authenticated;

create or replace function public.update_installment(p_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  update public.installments
  set
    description = coalesce(p_payload->>'description', description),
    total_amount = coalesce((p_payload->>'total_amount')::numeric, total_amount),
    installment_count = coalesce((p_payload->>'installment_count')::integer, installment_count),
    installment_amount = coalesce((p_payload->>'installment_amount')::numeric, installment_amount),
    first_due_date = coalesce((p_payload->>'first_due_date')::date, first_due_date),
    category = coalesce(p_payload->>'category', category),
    payment_method = coalesce(p_payload->>'payment_method', payment_method),
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Parcelamento nao encontrado';
  end if;
end;
$$;

revoke all on function public.update_installment(uuid, jsonb) from public, anon;
grant execute on function public.update_installment(uuid, jsonb) to authenticated;

create or replace function public.create_installment_payment(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  insert into public.installment_payments (
    user_id, installment_id, installment_number, due_date, amount, status
  )
  values (
    current_user_id,
    (p_payload->>'installment_id')::uuid,
    (p_payload->>'installment_number')::integer,
    (p_payload->>'due_date')::date,
    (p_payload->>'amount')::numeric,
    coalesce(p_payload->>'status', 'pending')
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_installment_payment(jsonb) from public, anon;
grant execute on function public.create_installment_payment(jsonb) to authenticated;
