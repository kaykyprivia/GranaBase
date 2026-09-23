-- ============================================================
-- update_installment_with_payments
-- Atualiza parcelamento + regenera todas as parcelas atomicamente
-- ============================================================

create or replace function public.update_installment_with_payments(
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

  update public.installments
  set
    description = coalesce(p_payload->>'description', description),
    total_amount = coalesce((p_payload->>'total_amount')::numeric, total_amount),
    installment_count = v_count,
    installment_amount = v_amount,
    first_due_date = v_first_due,
    category = coalesce(p_payload->>'category', category),
    payment_method = coalesce(p_payload->>'payment_method', payment_method),
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Parcelamento nao encontrado';
  end if;

  delete from public.installment_payments
  where installment_id = p_id and user_id = current_user_id;

  for i in 0..(v_count - 1) loop
    insert into public.installment_payments (
      user_id, installment_id, installment_number, due_date, amount, status
    )
    values (
      current_user_id,
      p_id,
      i + 1,
      (v_first_due + (i || ' months')::interval)::date,
      v_amount,
      'pending'
    );
  end loop;
end;
$$;

revoke all on function public.update_installment_with_payments(uuid, jsonb)
  from public, anon;

grant execute on function public.update_installment_with_payments(uuid, jsonb)
  to authenticated;
