-- ============================================================
-- FRENTE 1 — CARTÕES DE CRÉDITO (fix)
-- ============================================================

-- 1. Garantir que a constraint unique existe (a tabela pode ter sido criada antes sem ela)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_cards_user_id_name_key'
      and conrelid = 'public.user_cards'::regclass
  ) then
    alter table public.user_cards
      add constraint user_cards_user_id_name_key unique (user_id, name);
  end if;
end $$;

-- 2. RLS + policies (garantir)
alter table public.user_cards enable row level security;

drop policy if exists "users can read own cards" on public.user_cards;
create policy "users can read own cards"
  on public.user_cards for select
  using (auth.uid() = user_id);

-- 3. Coluna card_id (garantir)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expense_entries'
      and column_name = 'card_id'
  ) then
    alter table public.expense_entries
      add column card_id uuid references public.user_cards(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_expense_entries_card
  on public.expense_entries(card_id)
  where card_id is not null;

-- 4. AUTO-MIGRAÇÃO
do $$
declare
  v_user record;
  v_new_card_id uuid;
  v_due_day integer;
begin
  for v_user in
    select distinct user_id
    from public.expense_entries
    where card_due_date is not null
      and card_id is null
  loop
    select card_due_date
    into v_due_day
    from (
      select extract(day from card_due_date)::integer as card_due_date, count(*) as qtd
      from public.expense_entries
      where user_id = v_user.user_id
        and card_due_date is not null
        and card_id is null
      group by extract(day from card_due_date)::integer
      order by count(*) desc
      limit 1
    ) sub;

    if v_due_day is not null then
      insert into public.user_cards (user_id, name, due_day, closing_day, credit_limit, active)
      values (v_user.user_id, 'Cartao (configurar)', v_due_day, greatest(1, v_due_day - 7), null, true)
      on conflict (user_id, name) do nothing
      returning id into v_new_card_id;

      if v_new_card_id is null then
        select id into v_new_card_id
        from public.user_cards
        where user_id = v_user.user_id
          and name = 'Cartao (configurar)'
        limit 1;
      end if;

      update public.expense_entries
      set card_id = v_new_card_id
      where user_id = v_user.user_id
        and card_due_date is not null
        and card_id is null;
    end if;
  end loop;
end $$;

-- 5. RPC list_my_cards
create or replace function public.list_my_cards()
returns table (
  id uuid,
  name text,
  due_day integer,
  closing_day integer,
  credit_limit numeric,
  active boolean,
  created_at timestamptz,
  expense_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  select
    c.id,
    c.name,
    c.due_day,
    c.closing_day,
    c.credit_limit,
    c.active,
    c.created_at,
    coalesce((
      select count(*) from public.expense_entries e
      where e.card_id = c.id and e.user_id = current_user_id
    ), 0)
  from public.user_cards c
  where c.user_id = current_user_id
  order by c.active desc, c.name asc;
end;
$$;

revoke all on function public.list_my_cards() from public, anon;
grant execute on function public.list_my_cards() to authenticated;

-- 6. RPC create_my_card
create or replace function public.create_my_card(
  p_name text,
  p_due_day integer,
  p_closing_day integer,
  p_credit_limit numeric default null
)
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

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Nome do cartao obrigatorio';
  end if;

  if p_due_day is null or p_due_day < 1 or p_due_day > 31 then
    raise exception 'Dia de vencimento invalido (1-31)';
  end if;

  if p_closing_day is null or p_closing_day < 1 or p_closing_day > 31 then
    raise exception 'Dia de fechamento invalido (1-31)';
  end if;

  if p_credit_limit is not null and p_credit_limit < 0 then
    raise exception 'Limite nao pode ser negativo';
  end if;

  insert into public.user_cards (
    user_id, name, due_day, closing_day, credit_limit, active
  ) values (
    current_user_id, trim(p_name), p_due_day, p_closing_day, p_credit_limit, true
  )
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'Ja existe um cartao com esse nome';
end;
$$;

revoke all on function public.create_my_card(text, integer, integer, numeric) from public, anon;
grant execute on function public.create_my_card(text, integer, integer, numeric) to authenticated;

-- 7. RPC update_my_card
create or replace function public.update_my_card(
  p_card_id uuid,
  p_name text,
  p_due_day integer,
  p_closing_day integer,
  p_credit_limit numeric default null,
  p_active boolean default true
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

  if p_card_id is null then
    raise exception 'p_card_id obrigatorio';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Nome do cartao obrigatorio';
  end if;

  if p_due_day is null or p_due_day < 1 or p_due_day > 31 then
    raise exception 'Dia de vencimento invalido (1-31)';
  end if;

  if p_closing_day is null or p_closing_day < 1 or p_closing_day > 31 then
    raise exception 'Dia de fechamento invalido (1-31)';
  end if;

  update public.user_cards
  set
    name = trim(p_name),
    due_day = p_due_day,
    closing_day = p_closing_day,
    credit_limit = p_credit_limit,
    active = p_active,
    updated_at = now()
  where id = p_card_id and user_id = current_user_id;

  if not found then
    raise exception 'Cartao nao encontrado';
  end if;
exception
  when unique_violation then
    raise exception 'Ja existe outro cartao com esse nome';
end;
$$;

revoke all on function public.update_my_card(uuid, text, integer, integer, numeric, boolean) from public, anon;
grant execute on function public.update_my_card(uuid, text, integer, integer, numeric, boolean) to authenticated;

-- 8. RPC delete_my_card
create or replace function public.delete_my_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  v_expense_count bigint;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_card_id is null then
    raise exception 'p_card_id obrigatorio';
  end if;

  if not exists (
    select 1 from public.user_cards
    where id = p_card_id and user_id = current_user_id
  ) then
    raise exception 'Cartao nao encontrado';
  end if;

  select count(*) into v_expense_count
  from public.expense_entries
  where card_id = p_card_id and user_id = current_user_id;

  if v_expense_count > 0 then
    raise exception 'Existem % gastos vinculados a esse cartao. Edite-os antes de excluir.', v_expense_count;
  end if;

  delete from public.user_cards
  where id = p_card_id and user_id = current_user_id;
end;
$$;

revoke all on function public.delete_my_card(uuid) from public, anon;
grant execute on function public.delete_my_card(uuid) to authenticated;
