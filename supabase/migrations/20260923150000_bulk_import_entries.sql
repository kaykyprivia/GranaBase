-- ============================================================
-- bulk_import_entries
-- Importa em lote para income_entries ou expense_entries
-- ============================================================

create or replace function public.bulk_import_entries(
  p_kind text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  r jsonb;
  inserted_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_kind not in ('income', 'expense') then
    raise exception 'p_kind invalido: %', p_kind;
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows precisa ser array';
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    if p_kind = 'income' then
      insert into public.income_entries (
        user_id, description, amount, category, received_at, payment_method, notes
      )
      values (
        current_user_id,
        r->>'description',
        (r->>'amount')::numeric,
        r->>'category',
        (r->>'received_at')::date,
        r->>'payment_method',
        r->>'notes'
      );
    else
      insert into public.expense_entries (
        user_id, description, amount, category, spent_at, payment_method, notes
      )
      values (
        current_user_id,
        r->>'description',
        (r->>'amount')::numeric,
        r->>'category',
        (r->>'spent_at')::date,
        r->>'payment_method',
        r->>'notes'
      );
    end if;

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.bulk_import_entries(text, jsonb) from public, anon;
grant execute on function public.bulk_import_entries(text, jsonb) to authenticated;
