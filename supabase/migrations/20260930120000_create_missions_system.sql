-- ============================================================
-- MISSIONS SYSTEM v1
-- Tabelas: user_daily_streak, user_missions
-- ============================================================

-- ============================================================
-- 1. user_daily_streak — rastreia sequencia de acesso diario
-- ============================================================

create table if not exists public.user_daily_streak (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  last_visit_date date,
  updated_at timestamptz not null default now()
);

alter table public.user_daily_streak enable row level security;

-- Users podem so ler o proprio streak (nao escrever — escrita via RPC)
drop policy if exists "users can read own daily streak" on public.user_daily_streak;
create policy "users can read own daily streak"
  on public.user_daily_streak for select
  using (auth.uid() = user_id);

-- Super admin pode ler todos
drop policy if exists "super admins can read all streaks" on public.user_daily_streak;
create policy "super admins can read all streaks"
  on public.user_daily_streak for select
  using (public.is_super_admin());

comment on table public.user_daily_streak is
  'Sequencia de acesso diario do usuario. Atualizada via record_daily_visit().';

-- ============================================================
-- 2. user_missions — progresso e conclusao de missoes
-- ============================================================

create table if not exists public.user_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_key text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'rewarded', 'blocked')),
  progress integer not null default 0 check (progress >= 0),
  target integer not null default 1 check (target > 0),
  period_key text,
  completed_at timestamptz,
  rewarded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique: 1 missao one-shot por user; ou 1 por periodo (semanal)
create unique index if not exists idx_user_missions_unique_oneshot
  on public.user_missions(user_id, mission_key)
  where period_key is null;

create unique index if not exists idx_user_missions_unique_period
  on public.user_missions(user_id, mission_key, period_key)
  where period_key is not null;

create index if not exists idx_user_missions_user
  on public.user_missions(user_id, mission_key);

alter table public.user_missions enable row level security;

drop policy if exists "users can read own missions" on public.user_missions;
create policy "users can read own missions"
  on public.user_missions for select
  using (auth.uid() = user_id);

drop policy if exists "super admins can read all missions" on public.user_missions;
create policy "super admins can read all missions"
  on public.user_missions for select
  using (public.is_super_admin());

comment on table public.user_missions is
  'Progresso e historico de missoes do usuario. Escrita apenas via RPC.';
