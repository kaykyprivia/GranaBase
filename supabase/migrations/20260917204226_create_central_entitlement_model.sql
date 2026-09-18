create table public.entitlement_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.entitlement_accounts(user_id) on delete cascade,
  product text not null
    check (product in ('personal', 'business')),
  source text not null
    check (source in (
      'free',
      'trial',
      'bonus',
      'referral',
      'subscription',
      'admin',
      'legacy'
    )),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint entitlement_grants_valid_period
    check (ends_at is null or ends_at > starts_at),

  constraint entitlement_grants_valid_revocation
    check (
      (status = 'active' and revoked_at is null)
      or
      (status = 'revoked' and revoked_at is not null)
    )
);

create index entitlement_grants_resolution_idx
  on public.entitlement_grants (
    user_id,
    product,
    status,
    starts_at,
    ends_at
  );

create unique index entitlement_grants_external_reference_uidx
  on public.entitlement_grants (
    user_id,
    product,
    source,
    external_reference
  )
  where external_reference is not null;

alter table public.entitlement_accounts enable row level security;
alter table public.entitlement_grants enable row level security;

revoke all on table public.entitlement_accounts
  from public, anon, authenticated;

revoke all on table public.entitlement_grants
  from public, anon, authenticated;


create or replace function public.set_entitlement_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_entitlement_updated_at()
  from public, anon, authenticated;

create trigger set_entitlement_accounts_updated_at
before update on public.entitlement_accounts
for each row
execute function public.set_entitlement_updated_at();

create trigger set_entitlement_grants_updated_at
before update on public.entitlement_grants
for each row
execute function public.set_entitlement_updated_at();


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

drop trigger if exists on_auth_user_created_entitlement_account
  on auth.users;

create trigger on_auth_user_created_entitlement_account
after insert on auth.users
for each row
execute function public.provision_entitlement_account();

insert into public.entitlement_accounts (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;


create or replace function public.get_my_entitlements()
returns table (
  product text,
  has_access boolean,
  access_until timestamptz,
  sources text[],
  account_status text,
  evaluated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_account_status text;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select account.status
  into current_account_status
  from public.entitlement_accounts as account
  where account.user_id = current_user_id;

  current_account_status :=
    coalesce(current_account_status, 'missing');

  return query
  with products(product_name) as (
    values ('personal'::text), ('business'::text)
  )
  select
    products.product_name,
    (
      current_account_status = 'active'
      and count(grant_row.id) > 0
    ) as has_access,
    case
      when current_account_status <> 'active'
        or count(grant_row.id) = 0
        then null
      when count(grant_row.id)
        filter (where grant_row.ends_at is null) > 0
        then null
      else max(grant_row.ends_at)
    end as access_until,
    coalesce(
      array_agg(
        distinct grant_row.source
        order by grant_row.source
      ) filter (where grant_row.id is not null),
      array[]::text[]
    ) as sources,
    current_account_status as account_status,
    now() as evaluated_at
  from products
  left join public.entitlement_grants as grant_row
    on current_account_status = 'active'
   and grant_row.user_id = current_user_id
   and grant_row.product = products.product_name
   and grant_row.status = 'active'
   and grant_row.starts_at <= now()
   and (
     grant_row.ends_at is null
     or grant_row.ends_at > now()
   )
  group by products.product_name
  order by case
    when products.product_name = 'personal' then 1
    else 2
  end;
end;
$$;

revoke all on function public.get_my_entitlements()
  from public, anon;

grant execute on function public.get_my_entitlements()
  to authenticated;


create or replace function public.has_entitlement(
  p_product text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_product not in ('personal', 'business') then
    raise exception 'Produto de entitlement invalido';
  end if;

  return exists (
    select 1
    from public.entitlement_accounts as account
    join public.entitlement_grants as grant_row
      on grant_row.user_id = account.user_id
    where account.user_id = current_user_id
      and account.status = 'active'
      and grant_row.product = p_product
      and grant_row.status = 'active'
      and grant_row.starts_at <= now()
      and (
        grant_row.ends_at is null
        or grant_row.ends_at > now()
      )
  );
end;
$$;

revoke all on function public.has_entitlement(text)
  from public, anon;

grant execute on function public.has_entitlement(text)
  to authenticated;

comment on table public.entitlement_accounts is
  'Conta central de autorizacao comercial por usuario.';

comment on table public.entitlement_grants is
  'Concessoes auditaveis de acesso aos produtos Personal e Business.';

comment on function public.get_my_entitlements() is
  'Retorna o estado efetivo dos entitlements do usuario autenticado.';

comment on function public.has_entitlement(text) is
  'Verifica se o usuario autenticado possui acesso ativo ao produto.';