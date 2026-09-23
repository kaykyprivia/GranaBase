-- ============================================================
-- Corrige create_receivable: due_date -> expected_date
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
    user_id, description, amount, expected_date, status, category, notes
  )
  values (
    current_user_id,
    p_payload->>'description',
    (p_payload->>'amount')::numeric,
    (p_payload->>'expected_date')::date,
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
