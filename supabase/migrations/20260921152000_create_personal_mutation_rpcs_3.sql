-- ============================================================
-- PERSONAL MUTATION RPCs - Parte 3: installments + installment_payments
-- ============================================================

-- ============================================================
-- INSTALLMENTS
-- ============================================================

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
    user_id, description, total_amount, installments_count, category, start_date, notes
  )
  values (
    current_user_id,
    p_payload->>'description',
    (p_payload->>'total_amount')::numeric,
    (p_payload->>'installments_count')::integer,
    p_payload->>'category',
    (p_payload->>'start_date')::date,
    p_payload->>'notes'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_installment(jsonb)
  from public, anon;

grant execute on function public.create_installment(jsonb)
  to authenticated;


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
    installments_count = coalesce((p_payload->>'installments_count')::integer, installments_count),
    category = coalesce(p_payload->>'category', category),
    start_date = coalesce((p_payload->>'start_date')::date, start_date),
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Parcelamento nao encontrado';
  end if;
end;
$$;

revoke all on function public.update_installment(uuid, jsonb)
  from public, anon;

grant execute on function public.update_installment(uuid, jsonb)
  to authenticated;


create or replace function public.delete_installment(p_id uuid)
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

  delete from public.installments
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Parcelamento nao encontrado';
  end if;
end;
$$;

revoke all on function public.delete_installment(uuid)
  from public, anon;

grant execute on function public.delete_installment(uuid)
  to authenticated;


-- ============================================================
-- INSTALLMENT PAYMENTS
-- ============================================================

create or replace function public.create_installment_payment(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_id uuid;
  installment_owner uuid;
  parent_installment_id uuid := (p_payload->>'installment_id')::uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  -- Valida que o installment pertence ao user
  select user_id into installment_owner
  from public.installments
  where id = parent_installment_id;

  if installment_owner is null then
    raise exception 'Parcelamento nao encontrado';
  end if;

  if installment_owner != current_user_id then
    raise exception 'Acesso negado';
  end if;

  insert into public.installment_payments (
    user_id, installment_id, amount, paid_at, notes
  )
  values (
    current_user_id,
    parent_installment_id,
    (p_payload->>'amount')::numeric,
    coalesce((p_payload->>'paid_at')::date, now()::date),
    p_payload->>'notes'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_installment_payment(jsonb)
  from public, anon;

grant execute on function public.create_installment_payment(jsonb)
  to authenticated;


create or replace function public.update_installment_payment(
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

  update public.installment_payments
  set
    amount = coalesce((p_payload->>'amount')::numeric, amount),
    paid_at = coalesce((p_payload->>'paid_at')::date, paid_at),
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Pagamento nao encontrado';
  end if;
end;
$$;

revoke all on function public.update_installment_payment(uuid, jsonb)
  from public, anon;

grant execute on function public.update_installment_payment(uuid, jsonb)
  to authenticated;


create or replace function public.delete_installment_payment(p_id uuid)
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

  delete from public.installment_payments
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Pagamento nao encontrado';
  end if;
end;
$$;

revoke all on function public.delete_installment_payment(uuid)
  from public, anon;

grant execute on function public.delete_installment_payment(uuid)
  to authenticated;
