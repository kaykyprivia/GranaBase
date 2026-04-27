-- GranaBase — Financial tables migration
-- profiles already exists, creating only the missing tables

-- ── INCOME ENTRIES ──────────────────────────────────────────────────────────
create table if not exists public.income_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  description     text not null,
  amount          numeric(12,2) not null check (amount > 0),
  category        text not null,
  received_at     date not null,
  payment_method  text,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table public.income_entries enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'income_entries' and policyname = 'users can select own income') then
    create policy "users can select own income" on public.income_entries for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'income_entries' and policyname = 'users can insert own income') then
    create policy "users can insert own income" on public.income_entries for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'income_entries' and policyname = 'users can update own income') then
    create policy "users can update own income" on public.income_entries for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'income_entries' and policyname = 'users can delete own income') then
    create policy "users can delete own income" on public.income_entries for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_income_user_received on public.income_entries(user_id, received_at desc);

-- ── EXPENSE ENTRIES ──────────────────────────────────────────────────────────
create table if not exists public.expense_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  description     text not null,
  amount          numeric(12,2) not null check (amount > 0),
  category        text not null,
  spent_at        date not null,
  payment_method  text,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table public.expense_entries enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'expense_entries' and policyname = 'users can select own expenses') then
    create policy "users can select own expenses" on public.expense_entries for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'expense_entries' and policyname = 'users can insert own expenses') then
    create policy "users can insert own expenses" on public.expense_entries for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'expense_entries' and policyname = 'users can update own expenses') then
    create policy "users can update own expenses" on public.expense_entries for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'expense_entries' and policyname = 'users can delete own expenses') then
    create policy "users can delete own expenses" on public.expense_entries for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_expense_user_spent on public.expense_entries(user_id, spent_at desc);

-- ── BILLS ────────────────────────────────────────────────────────────────────
create table if not exists public.bills (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  amount        numeric(12,2) not null check (amount > 0),
  due_date      date not null,
  status        text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  category      text not null,
  is_recurring  boolean not null default false,
  paid_at       timestamptz,
  notes         text,
  created_at    timestamptz not null default now()
);

alter table public.bills enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'bills' and policyname = 'users can select own bills') then
    create policy "users can select own bills" on public.bills for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bills' and policyname = 'users can insert own bills') then
    create policy "users can insert own bills" on public.bills for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bills' and policyname = 'users can update own bills') then
    create policy "users can update own bills" on public.bills for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bills' and policyname = 'users can delete own bills') then
    create policy "users can delete own bills" on public.bills for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_bills_user_due on public.bills(user_id, due_date);
create index if not exists idx_bills_user_status on public.bills(user_id, status);

-- ── INSTALLMENTS ─────────────────────────────────────────────────────────────
create table if not exists public.installments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  description         text not null,
  total_amount        numeric(12,2) not null check (total_amount > 0),
  installment_count   integer not null check (installment_count > 0),
  installment_amount  numeric(12,2) not null check (installment_amount > 0),
  first_due_date      date not null,
  notes               text,
  created_at          timestamptz not null default now()
);

alter table public.installments enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'installments' and policyname = 'users can select own installments') then
    create policy "users can select own installments" on public.installments for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'installments' and policyname = 'users can insert own installments') then
    create policy "users can insert own installments" on public.installments for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'installments' and policyname = 'users can update own installments') then
    create policy "users can update own installments" on public.installments for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'installments' and policyname = 'users can delete own installments') then
    create policy "users can delete own installments" on public.installments for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ── INSTALLMENT PAYMENTS ──────────────────────────────────────────────────────
create table if not exists public.installment_payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  installment_id      uuid not null references public.installments(id) on delete cascade,
  installment_number  integer not null,
  due_date            date not null,
  amount              numeric(12,2) not null check (amount > 0),
  status              text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);

alter table public.installment_payments enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'installment_payments' and policyname = 'users can select own installment_payments') then
    create policy "users can select own installment_payments" on public.installment_payments for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'installment_payments' and policyname = 'users can insert own installment_payments') then
    create policy "users can insert own installment_payments" on public.installment_payments for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'installment_payments' and policyname = 'users can update own installment_payments') then
    create policy "users can update own installment_payments" on public.installment_payments for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'installment_payments' and policyname = 'users can delete own installment_payments') then
    create policy "users can delete own installment_payments" on public.installment_payments for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_ip_installment on public.installment_payments(installment_id);
create index if not exists idx_ip_user_due on public.installment_payments(user_id, due_date);

-- ── INVESTMENTS ───────────────────────────────────────────────────────────────
create table if not exists public.investments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  amount           numeric(12,2) not null check (amount > 0),
  investment_type  text not null,
  invested_at      date not null,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.investments enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'investments' and policyname = 'users can select own investments') then
    create policy "users can select own investments" on public.investments for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'investments' and policyname = 'users can insert own investments') then
    create policy "users can insert own investments" on public.investments for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'investments' and policyname = 'users can update own investments') then
    create policy "users can update own investments" on public.investments for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'investments' and policyname = 'users can delete own investments') then
    create policy "users can delete own investments" on public.investments for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_investments_user on public.investments(user_id, invested_at desc);

-- ── FINANCIAL GOALS ───────────────────────────────────────────────────────────
create table if not exists public.financial_goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  target_amount   numeric(12,2) not null check (target_amount > 0),
  current_amount  numeric(12,2) not null default 0 check (current_amount >= 0),
  deadline        date,
  status          text not null default 'active' check (status in ('active', 'completed', 'paused')),
  category        text not null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.financial_goals enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'financial_goals' and policyname = 'users can select own goals') then
    create policy "users can select own goals" on public.financial_goals for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'financial_goals' and policyname = 'users can insert own goals') then
    create policy "users can insert own goals" on public.financial_goals for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'financial_goals' and policyname = 'users can update own goals') then
    create policy "users can update own goals" on public.financial_goals for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'financial_goals' and policyname = 'users can delete own goals') then
    create policy "users can delete own goals" on public.financial_goals for delete using (auth.uid() = user_id);
  end if;
end $$;

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists set_goals_updated_at on public.financial_goals;
create trigger set_goals_updated_at
  before update on public.financial_goals
  for each row execute procedure public.set_updated_at();

-- auto-create profile trigger (if not exists)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
