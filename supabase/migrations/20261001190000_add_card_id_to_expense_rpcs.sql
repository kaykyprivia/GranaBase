-- Adiciona suporte a card_id nas RPCs de expense_entries.
-- Regras:
--   - card_id so e aceito quando payment_method contem "Credito"
--   - se card_id foi informado e card_due_date nao veio, calcula a partir do card.due_day
--   - aceita tanto "paid_at" (legado) quanto "spent_at" (frontend atual) como chave da data
--   - sem backfill: gastos antigos ficam como estao

-- ============================================================
-- 1. Helper: calcula card_due_date a partir do card + data gasto
-- ============================================================
create or replace function public._calc_card_due_date(
  p_card_id uuid,
  p_spent_at date
)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_due_day integer;
  v_year integer;
  v_month integer;
  v_result date;
  v_last_day integer;
begin
  if p_card_id is null or p_spent_at is null then
    return null;
  end if;

  select due_day into v_due_day
  from public.user_cards
  where id = p_card_id and user_id = auth.uid();

  if v_due_day is null then
    return null;
  end if;

  v_year := extract(year from p_spent_at)::integer;
  v_month := extract(month from p_spent_at)::integer;

  v_last_day := extract(day from (date_trunc('month', p_spent_at) + interval '1 month - 1 day'))::integer;

  if v_due_day > v_last_day then
    v_due_day := v_last_day;
  end if;

  v_result := make_date(v_year, v_month, v_due_day);

  if v_result < p_spent_at then
    v_result := v_result + interval '1 month';
  end if;

  return v_result;
end;
$$;

revoke all on function public._calc_card_due_date(uuid, date) from public, anon;
grant execute on function public._calc_card_due_date(uuid, date) to authenticated;

-- ============================================================
-- 2. create_expense_entry
-- ============================================================
create or replace function public.create_expense_entry(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  v_new_id uuid;
  v_payment_method text := p_payload->>'payment_method';
  v_card_id uuid := nullif(p_payload->>'card_id', '')::uuid;
  -- aceita as duas chaves (frontend manda "spent_at", legado manda "paid_at")
  v_spent_at date := coalesce(
    nullif(p_payload->>'spent_at', '')::date,
    nullif(p_payload->>'paid_at', '')::date
  );
  v_card_due_date date := nullif(p_payload->>'card_due_date', '')::date;
  v_effective_card_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if v_payment_method is null or position('credito' in lower(v_payment_method)) = 0 then
    v_effective_card_id := null;
  else
    v_effective_card_id := v_card_id;
  end if;

  if v_effective_card_id is not null and v_card_due_date is null then
    v_card_due_date := public._calc_card_due_date(v_effective_card_id, v_spent_at);
  end if;

  insert into public.expense_entries (
    user_id, description, amount, category, spent_at,
    payment_method, card_due_date, card_id, notes
  ) values (
    current_user_id,
    p_payload->>'description',
    (p_payload->>'amount')::numeric,
    p_payload->>'category',
    v_spent_at,
    v_payment_method,
    v_card_due_date,
    v_effective_card_id,
    p_payload->>'notes'
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.create_expense_entry(jsonb) from public, anon;
grant execute on function public.create_expense_entry(jsonb) to authenticated;

-- ============================================================
-- 3. update_expense_entry
-- ============================================================
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
  v_payment_method text;
  v_card_id uuid;
  v_spent_at date;
  v_effective_card_id uuid;
  v_card_due_date date;
  v_has_card_id boolean := p_payload ? 'card_id';
  v_has_card_due_date boolean := p_payload ? 'card_due_date';
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select
    coalesce(p_payload->>'payment_method', payment_method),
    coalesce(
      nullif(p_payload->>'spent_at', '')::date,
      nullif(p_payload->>'paid_at', '')::date,
      spent_at
    ),
    case when v_has_card_id then nullif(p_payload->>'card_id', '')::uuid else card_id end,
    case when v_has_card_due_date then nullif(p_payload->>'card_due_date', '')::date else card_due_date end
  into v_payment_method, v_spent_at, v_card_id, v_card_due_date
  from public.expense_entries
  where id = p_id and user_id = current_user_id;

  if v_payment_method is null then
    raise exception 'Gasto nao encontrado';
  end if;

  if position('credito' in lower(v_payment_method)) = 0 then
    v_effective_card_id := null;
    v_card_due_date := null;
  else
    v_effective_card_id := v_card_id;

    if v_effective_card_id is not null and not v_has_card_due_date then
      v_card_due_date := public._calc_card_due_date(v_effective_card_id, v_spent_at);
    end if;
  end if;

  update public.expense_entries
  set
    description = coalesce(p_payload->>'description', description),
    amount = coalesce((p_payload->>'amount')::numeric, amount),
    category = coalesce(p_payload->>'category', category),
    spent_at = coalesce(
      nullif(p_payload->>'spent_at', '')::date,
      nullif(p_payload->>'paid_at', '')::date,
      spent_at
    ),
    payment_method = coalesce(p_payload->>'payment_method', payment_method),
    card_due_date = v_card_due_date,
    card_id = v_effective_card_id,
    notes = coalesce(p_payload->>'notes', notes)
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Gasto nao encontrado';
  end if;
end;
$$;

revoke all on function public.update_expense_entry(uuid, jsonb) from public, anon;
grant execute on function public.update_expense_entry(uuid, jsonb) to authenticated;
