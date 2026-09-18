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

  insert into public.entitlement_grants (
    user_id,
    product,
    source,
    status,
    starts_at,
    ends_at,
    external_reference,
    metadata
  )
  values (
    new.id,
    'personal',
    'free',
    'active',
    now(),
    null,
    'free-personal-v1',
    '{"provisioned_by":"system"}'::jsonb
  )
  on conflict (
    user_id,
    product,
    source,
    external_reference
  )
  where external_reference is not null
  do nothing;

  return new;
end;
$$;

revoke all on function public.provision_entitlement_account()
  from public, anon, authenticated;


insert into public.entitlement_accounts (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;


insert into public.entitlement_grants (
  user_id,
  product,
  source,
  status,
  starts_at,
  ends_at,
  external_reference,
  metadata
)
select
  users.id,
  'personal',
  'free',
  'active',
  now(),
  null,
  'free-personal-v1',
  '{"provisioned_by":"backfill"}'::jsonb
from auth.users as users
on conflict (
  user_id,
  product,
  source,
  external_reference
)
where external_reference is not null
do nothing;


comment on function public.provision_entitlement_account() is
  'Cria a conta de entitlement e concede acesso gratuito permanente ao produto Personal.';