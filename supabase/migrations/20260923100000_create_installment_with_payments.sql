-- ============================================================
-- create_installment_with_payments
-- Cria parcelamento + todas as parcelas atomicamente
-- ============================================================

create or replace function public.create_installment_with_payments(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_id uuid;
  v_count integer;
  v_amount numeric;
  v_first_due date;
  i integer;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  v_count := (p_payload->>'installment_count')::integer;
  v_amount := (p_payload->>'installment_amount')::numeric;
  v_first_due := (p_payload->>'first_due_date')::date;

  if v_count is null or v_count < 1 then
    raise exception 'installment_count invalido';
  end if;

  insert into public.installments (
    user_id, description, total_amount, installment_count,
    installment_amount, first_due_date, category, payment_method, notes
  )
  values (
    current_user_id,
    p_payload->>'description',
    (p_payload->>'total_amount')::numeric,
    v_count,
    v_amount,
    v_first_due,
    p_payload->>'category',
    p_payload->>'payment_method',
    p_payload->>'notes'
  )
  returning id into new_id;

  for i in 0..(v_count - 1) loop
    insert into public.installment_payments (
      user_id, installment_id, installment_number, due_date, amount, status
    )
    values (
      current_user_id,
      new_id,
      i + 1,
      (v_first_due + (i || ' months')::interval)::date,
      v_amount,
      'pending'
    );
  end loop;

  return new_id;
end;
$$;

revoke all on function public.create_installment_with_payments(jsonb)
  from public, anon;

grant execute on function public.create_installment_with_payments(jsonb)
  to authenticated;
