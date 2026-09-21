-- ============================================================
-- PERSONAL MUTATION RPCs - Parte 2: bills + financial_goals + receivables
-- ============================================================

-- ============================================================
-- BILLS
-- ============================================================

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
    user_id, description, amount, due_date, category, status, notes
  )
  values (
    current_user_id,
    p_payload->>'description',
    (p_payload->>'amount')::numeric,
    (p_payload->>'due_date')::date,
    p_payload->>'category',
    coalesce(p_payload->>'status', 'pending'),
    p_payload->>'notes'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_bill(jsonb)
  from public, anon;

grant execute on function public.create_bill(jsonb)
  to authenticated;


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
    description = coalesce(p_payload->>'description', description),
    amount = coalesce((p_payload->>'amount')::numeric, amount),
    due_date = coalesce((p_payload->>'due_date')::date, due_date),
    category = coalesce(p_payload->>'category', category),
    status = coalesce(p_payload->>'status', status),
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Conta nao encontrada';
  end if;
end;
$$;

revoke all on function public.update_bill(uuid, jsonb)
  from public, anon;

grant execute on function public.update_bill(uuid, jsonb)
  to authenticated;


create or replace function public.delete_bill(p_id uuid)
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

  delete from public.bills
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Conta nao encontrada';
  end if;
end;
$$;

revoke all on function public.delete_bill(uuid)
  from public, anon;

grant execute on function public.delete_bill(uuid)
  to authenticated;


-- ============================================================
-- FINANCIAL GOALS
-- ============================================================

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
    user_id, name, target_amount, current_amount, deadline, category, notes
  )
  values (
    current_user_id,
    p_payload->>'name',
    (p_payload->>'target_amount')::numeric,
    coalesce((p_payload->>'current_amount')::numeric, 0),
    (p_payload->>'deadline')::date,
    p_payload->>'category',
    p_payload->>'notes'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_financial_goal(jsonb)
  from public, anon;

grant execute on function public.create_financial_goal(jsonb)
  to authenticated;


create or replace function public.update_financial_goal(
  p_id uuid,
  p_payload jsonb
)
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
    current_amount = coalesce((p_payload->>'current_amount')::numeric, current_amount),
    deadline = coalesce((p_payload->>'deadline')::date, deadline),
    category = coalesce(p_payload->>'category', category),
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Meta nao encontrada';
  end if;
end;
$$;

revoke all on function public.update_financial_goal(uuid, jsonb)
  from public, anon;

grant execute on function public.update_financial_goal(uuid, jsonb)
  to authenticated;


create or replace function public.delete_financial_goal(p_id uuid)
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

  delete from public.financial_goals
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Meta nao encontrada';
  end if;
end;
$$;

revoke all on function public.delete_financial_goal(uuid)
  from public, anon;

grant execute on function public.delete_financial_goal(uuid)
  to authenticated;


-- ============================================================
-- RECEIVABLES
-- ============================================================

create or replace function public.create_receivable(p_payload jsonb)
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

  insert into public.receivables (
    user_id, description, amount, due_date, status, category, notes
  )
  values (
    current_user_id,
    p_payload->>'description',
    (p_payload->>'amount')::numeric,
    (p_payload->>'due_date')::date,
    coalesce(p_payload->>'status', 'pending'),
    p_payload->>'category',
    p_payload->>'notes'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_receivable(jsonb)
  from public, anon;

grant execute on function public.create_receivable(jsonb)
  to authenticated;


create or replace function public.update_receivable(
  p_id uuid,
  p_payload jsonb
)
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

  update public.receivables
  set
    description = coalesce(p_payload->>'description', description),
    amount = coalesce((p_payload->>'amount')::numeric, amount),
    due_date = coalesce((p_payload->>'due_date')::date, due_date),
    status = coalesce(p_payload->>'status', status),
    category = coalesce(p_payload->>'category', category),
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'A receber nao encontrado';
  end if;
end;
$$;

revoke all on function public.update_receivable(uuid, jsonb)
  from public, anon;

grant execute on function public.update_receivable(uuid, jsonb)
  to authenticated;


create or replace function public.delete_receivable(p_id uuid)
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

  delete from public.receivables
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'A receber nao encontrado';
  end if;
end;
$$;

revoke all on function public.delete_receivable(uuid)
  from public, anon;

grant execute on function public.delete_receivable(uuid)
  to authenticated;
