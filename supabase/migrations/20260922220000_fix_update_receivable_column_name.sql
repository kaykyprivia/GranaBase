-- ============================================================
-- Corrige update_receivable: due_date -> expected_date
-- ============================================================

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
    expected_date = coalesce((p_payload->>'expected_date')::date, expected_date),
    status = coalesce(p_payload->>'status', status),
    received_at = case
      when p_payload ? 'received_at' then (p_payload->>'received_at')::timestamptz
      else received_at
    end,
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
