-- ============================================================
-- Estende update_installment_payment: aceita amount e due_date
-- ============================================================

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
    status = coalesce(p_payload->>'status', status),
    paid_at = case when p_payload ? 'paid_at' then (p_payload->>'paid_at')::timestamptz else paid_at end,
    paid_amount = case when p_payload ? 'paid_amount' then (p_payload->>'paid_amount')::numeric else paid_amount end,
    amount = coalesce((p_payload->>'amount')::numeric, amount),
    due_date = coalesce((p_payload->>'due_date')::date, due_date),
    notes = case when p_payload ? 'notes' then p_payload->>'notes' else notes end
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Parcela nao encontrada';
  end if;
end;
$$;

revoke all on function public.update_installment_payment(uuid, jsonb) from public, anon;
grant execute on function public.update_installment_payment(uuid, jsonb) to authenticated;
