-- ============================================================
-- FIX: Conta nova nao deve ganhar grants free automaticos
-- Regra: usuario ativa 7 dias gratis manualmente em /onboarding
-- ============================================================

-- 1. Remove TODOS os grants free infinitos (bug de provisionamento)
--    Inclui os criados por trigger E os criados em backfills
delete from public.entitlement_grants
where source = 'free'
  and ends_at is null
  and external_reference in ('free-personal-v1', 'free-business-v1');

-- 2. Reescreve provision_entitlement_account: apenas cria a account
--    NAO concede grants automaticos
create or replace function public.provision_entitlement_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.entitlement_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.provision_entitlement_account()
  from public, anon, authenticated;

comment on function public.provision_entitlement_account() is
  'Cria conta de entitlement no signup. Grants de acesso sao concedidos apenas via activate_free_product ou admin.';

-- 3. Recria trigger (garante que está apontando pra versao nova)
drop trigger if exists on_auth_user_created_entitlement_account
  on auth.users;

create trigger on_auth_user_created_entitlement_account
after insert on auth.users
for each row
execute function public.provision_entitlement_account();

-- 4. Backfill: cria entitlement_accounts para usuarios que ainda nao tem
insert into public.entitlement_accounts (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;
