create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  avatar_url text,
  theme_preference text not null default 'dark' check (theme_preference in ('dark', 'light')),
  currency_format text not null default 'BRL' check (currency_format in ('BRL', 'USD')),
  privacy_mode boolean not null default false,
  week_start text not null default 'monday' check (week_start in ('monday', 'sunday')),
  notifications_enabled boolean not null default true,
  primary_currency text not null default 'BRL' check (primary_currency in ('BRL', 'USD')),
  monthly_goal_default numeric(12,2) not null default 0 check (monthly_goal_default >= 0),
  default_expense_category text not null default 'Outro',
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'user_settings' and policyname = 'users can select own settings') then
    create policy "users can select own settings" on public.user_settings for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'user_settings' and policyname = 'users can insert own settings') then
    create policy "users can insert own settings" on public.user_settings for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'user_settings' and policyname = 'users can update own settings') then
    create policy "users can update own settings" on public.user_settings for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'user_settings' and policyname = 'users can delete own settings') then
    create policy "users can delete own settings" on public.user_settings for delete using (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
  before update on public.user_settings
  for each row execute procedure public.set_updated_at();

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
