-- ── RECEIVABLES (dinheiro a receber) ───────────────────────────────────────
create table if not exists public.receivables (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  description   text not null,
  amount        numeric(12,2) not null check (amount > 0),
  expected_date date not null,
  status        text not null default 'pending' check (status in ('pending', 'received', 'overdue')),
  category      text not null,
  received_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now()
);

alter table public.receivables enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'receivables' and policyname = 'users can select own receivables') then
    create policy "users can select own receivables" on public.receivables for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'receivables' and policyname = 'users can insert own receivables') then
    create policy "users can insert own receivables" on public.receivables for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'receivables' and policyname = 'users can update own receivables') then
    create policy "users can update own receivables" on public.receivables for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'receivables' and policyname = 'users can delete own receivables') then
    create policy "users can delete own receivables" on public.receivables for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_receivables_user_due on public.receivables(user_id, expected_date);
create index if not exists idx_receivables_user_status on public.receivables(user_id, status);
