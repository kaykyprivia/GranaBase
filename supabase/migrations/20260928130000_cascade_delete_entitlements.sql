-- ============================================================
-- FIX: cascade delete em entitlement tables
-- Evita contas orfas quando um usuario e deletado
-- ============================================================

-- 1. Limpa accounts orfas (sem usuario em auth.users)
delete from public.entitlement_accounts
where user_id not in (select id from auth.users);

-- 2. Limpa grants orfaos
delete from public.entitlement_grants
where user_id not in (select id from auth.users);

-- 3. Adiciona FK cascade em entitlement_accounts
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'entitlement_accounts_user_id_fkey'
  ) then
    alter table public.entitlement_accounts
      drop constraint entitlement_accounts_user_id_fkey;
  end if;

  alter table public.entitlement_accounts
    add constraint entitlement_accounts_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
end $$;

-- 4. Adiciona FK cascade em entitlement_grants
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'entitlement_grants_user_id_fkey'
  ) then
    alter table public.entitlement_grants
      drop constraint entitlement_grants_user_id_fkey;
  end if;

  alter table public.entitlement_grants
    add constraint entitlement_grants_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
end $$;
