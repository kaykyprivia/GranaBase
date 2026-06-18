-- The original receivables migration referenced public.profiles(id), mirroring the
-- (outdated) granabase_tables.sql text. In the live database every other table's
-- user_id FK actually points to auth.users(id), not profiles(id). Align receivables
-- with that, since profiles(id) does not reliably contain a row per auth user here.
alter table public.receivables drop constraint if exists receivables_user_id_fkey;
alter table public.receivables
  add constraint receivables_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
