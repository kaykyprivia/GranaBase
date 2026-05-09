-- Centralize user patrimonio into a single wallet and make goals observe it.

create table if not exists public.investment_wallets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  total_balance  numeric(12,2) not null default 0 check (total_balance >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint investment_wallets_user_id_key unique (user_id)
);

create table if not exists public.investment_contributions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  wallet_id    uuid not null references public.investment_wallets(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  type         text not null check (type in ('deposit', 'withdraw')),
  description  text,
  created_at   timestamptz not null default now()
);

alter table public.investment_wallets enable row level security;
alter table public.investment_contributions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'investment_wallets' and policyname = 'users can select own wallet') then
    create policy "users can select own wallet" on public.investment_wallets for select using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'investment_contributions' and policyname = 'users can select own contributions') then
    create policy "users can select own contributions" on public.investment_contributions for select using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_investment_contributions_user_created
  on public.investment_contributions(user_id, created_at desc);

create index if not exists idx_investment_contributions_wallet_created
  on public.investment_contributions(wallet_id, created_at desc);

drop trigger if exists set_investment_wallets_updated_at on public.investment_wallets;
create trigger set_investment_wallets_updated_at
  before update on public.investment_wallets
  for each row execute procedure public.set_updated_at();

insert into public.investment_wallets (user_id, total_balance, created_at, updated_at)
select
  source.user_id,
  greatest(source.goal_balance, source.invested_balance),
  now(),
  now()
from (
  select
    users.user_id,
    coalesce(goal_totals.goal_balance, 0) as goal_balance,
    coalesce(investment_totals.invested_balance, 0) as invested_balance
  from (
    select user_id from public.financial_goals
    union
    select user_id from public.investments
  ) users
  left join (
    select user_id, max(current_amount) as goal_balance
    from public.financial_goals
    group by user_id
  ) goal_totals on goal_totals.user_id = users.user_id
  left join (
    select user_id, sum(amount) as invested_balance
    from public.investments
    group by user_id
  ) investment_totals on investment_totals.user_id = users.user_id
) source
where greatest(source.goal_balance, source.invested_balance) > 0
on conflict (user_id) do update
set total_balance = greatest(public.investment_wallets.total_balance, excluded.total_balance),
    updated_at = now();

insert into public.investment_contributions (user_id, wallet_id, amount, type, description, created_at)
select
  wallet.user_id,
  wallet.id,
  wallet.total_balance,
  'deposit',
  'Migracao automatica do patrimonio existente sem somar metas duplicadas',
  now()
from public.investment_wallets wallet
where wallet.total_balance > 0
  and not exists (
    select 1
    from public.investment_contributions contribution
    where contribution.wallet_id = wallet.id
      and contribution.description = 'Migracao automatica do patrimonio existente sem somar metas duplicadas'
  );

create or replace function public.sync_financial_goals_with_wallet(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_balance numeric(12,2);
begin
  select coalesce(total_balance, 0)
    into wallet_balance
  from public.investment_wallets
  where user_id = p_user_id;

  wallet_balance := coalesce(wallet_balance, 0);

  update public.financial_goals
  set status = case
      when wallet_balance >= target_amount then 'completed'
      when status = 'completed' then 'active'
      else status
    end
  where user_id = p_user_id
    and (
      (wallet_balance >= target_amount and status <> 'completed')
      or (wallet_balance < target_amount and status = 'completed')
    );
end;
$$;

create or replace function public.set_financial_goal_status_from_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_balance numeric(12,2);
begin
  select coalesce(total_balance, 0)
    into wallet_balance
  from public.investment_wallets
  where user_id = new.user_id;

  wallet_balance := coalesce(wallet_balance, 0);

  if wallet_balance >= new.target_amount then
    new.status := 'completed';
  elsif new.status = 'completed' then
    new.status := 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists set_financial_goal_status_from_wallet on public.financial_goals;
create trigger set_financial_goal_status_from_wallet
  before insert or update of target_amount, status, user_id on public.financial_goals
  for each row execute procedure public.set_financial_goal_status_from_wallet();

create or replace function public.sync_goals_after_wallet_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_financial_goals_with_wallet(new.user_id);
  return new;
end;
$$;

drop trigger if exists sync_goals_after_wallet_change on public.investment_wallets;
create trigger sync_goals_after_wallet_change
  after insert or update of total_balance on public.investment_wallets
  for each row execute procedure public.sync_goals_after_wallet_change();

create or replace function public.record_investment_contribution(
  p_amount numeric,
  p_type text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  wallet_row public.investment_wallets%rowtype;
  next_balance numeric(12,2);
  contribution_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor deve ser positivo';
  end if;

  if p_type not in ('deposit', 'withdraw') then
    raise exception 'Tipo de movimentacao invalido';
  end if;

  insert into public.investment_wallets (user_id, total_balance)
  values (current_user_id, 0)
  on conflict (user_id) do nothing;

  select *
    into wallet_row
  from public.investment_wallets
  where user_id = current_user_id
  for update;

  next_balance := case
    when p_type = 'deposit' then wallet_row.total_balance + round(p_amount, 2)
    else wallet_row.total_balance - round(p_amount, 2)
  end;

  if next_balance < 0 then
    raise exception 'Retirada maior que o patrimonio disponivel';
  end if;

  insert into public.investment_contributions (user_id, wallet_id, amount, type, description)
  values (current_user_id, wallet_row.id, round(p_amount, 2), p_type, nullif(trim(p_description), ''))
  returning id into contribution_id;

  update public.investment_wallets
  set total_balance = next_balance
  where id = wallet_row.id;

  return contribution_id;
end;
$$;

grant execute on function public.record_investment_contribution(numeric, text, text) to authenticated;
grant execute on function public.sync_financial_goals_with_wallet(uuid) to authenticated;

select public.sync_financial_goals_with_wallet(wallet.user_id)
from public.investment_wallets wallet;

alter table public.financial_goals
  drop column if exists current_amount;
