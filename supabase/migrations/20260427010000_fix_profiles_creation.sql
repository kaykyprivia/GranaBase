-- Fix: financial tables FK should reference auth.users(id) directly.
-- The remote profiles table uses a separate auto-generated id (not the auth UUID),
-- so the original FK (user_id → profiles.id) always fails.

alter table public.income_entries
  drop constraint if exists income_entries_user_id_fkey;
alter table public.income_entries
  add constraint income_entries_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.expense_entries
  drop constraint if exists expense_entries_user_id_fkey;
alter table public.expense_entries
  add constraint expense_entries_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.bills
  drop constraint if exists bills_user_id_fkey;
alter table public.bills
  add constraint bills_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.installments
  drop constraint if exists installments_user_id_fkey;
alter table public.installments
  add constraint installments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.installment_payments
  drop constraint if exists installment_payments_user_id_fkey;
alter table public.installment_payments
  add constraint installment_payments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.investments
  drop constraint if exists investments_user_id_fkey;
alter table public.investments
  add constraint investments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.financial_goals
  drop constraint if exists financial_goals_user_id_fkey;
alter table public.financial_goals
  add constraint financial_goals_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Update handle_new_user to match actual profiles schema (no email column, uses user_id not id)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
