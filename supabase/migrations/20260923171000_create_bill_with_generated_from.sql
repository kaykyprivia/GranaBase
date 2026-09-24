-- ============================================================
-- create_bill: aceita generated_from_bill_id
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
    user_id, name, amount, due_date, category, status, is_recurring, paid_at, notes,
    generated_from_bill_id
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
    p_payload->>'notes',
    case when p_payload ? 'generated_from_bill_id' 
         then (p_payload->>'generated_from_bill_id')::uuid 
         else null end
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_bill(jsonb) from public, anon;
grant execute on function public.create_bill(jsonb) to authenticated;
