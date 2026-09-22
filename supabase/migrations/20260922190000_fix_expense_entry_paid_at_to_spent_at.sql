-- ============================================================
-- Corrige create_expense_entry: paid_at -> spent_at
-- A tabela usa "spent_at" (data do gasto), nao "paid_at"
-- ============================================================

create or replace function public.create_expense_entry(p_payload jsonb)
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

  insert into public.expense_entries (
    user_id, description, amount, category, spent_at, payment_method, card_due_date, notes
  )
  values (
    current_user_id,
    p_payload->>'description',
    (p_payload->>'amount')::numeric,
    p_payload->>'category',
    (p_payload->>'spent_at')::date,
    p_payload->>'payment_method',
    nullif(p_payload->>'card_due_date', '')::date,
    p_payload->>'notes'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_expense_entry(jsonb)
  from public, anon;

grant execute on function public.create_expense_entry(jsonb)
  to authenticated;


-- Mesma correcao pra update
create or replace function public.update_expense_entry(
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

  update public.expense_entries
  set
    description = coalesce(p_payload->>'description', description),
    amount = coalesce((p_payload->>'amount')::numeric, amount),
    category = coalesce(p_payload->>'category', category),
    spent_at = coalesce((p_payload->>'spent_at')::date, spent_at),
    payment_method = coalesce(p_payload->>'payment_method', payment_method),
    card_due_date = case
      when p_payload ? 'card_due_date' then nullif(p_payload->>'card_due_date', '')::date
      else card_due_date
    end,
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Gasto nao encontrado';
  end if;
end;
$$;

revoke all on function public.update_expense_entry(uuid, jsonb)
  from public, anon;

grant execute on function public.update_expense_entry(uuid, jsonb)
  to authenticated;
