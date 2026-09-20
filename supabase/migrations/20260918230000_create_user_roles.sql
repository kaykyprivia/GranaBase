-- ============================================================
-- USER ROLES - Controle de acesso administrativo
-- Roles: USER, SUPER_ADMIN
-- Backend-first (UI do admin vem depois)
-- ============================================================

-- ============================================================
-- 1. TABELA: user_roles
-- ============================================================

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id) on delete cascade,

  role text not null
    check (role in ('USER', 'SUPER_ADMIN')),

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint user_roles_unique_per_user
    unique (user_id, role)
);

create index user_roles_user_id_idx
  on public.user_roles (user_id);

create index user_roles_role_idx
  on public.user_roles (role);

alter table public.user_roles enable row level security;

revoke all on table public.user_roles
  from public, anon, authenticated;


-- ============================================================
-- 2. RPC: is_super_admin (authenticated)
-- ============================================================

create or replace function public.is_super_admin()
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
    return false;
  end if;

  return exists (
    select 1
    from public.user_roles
    where user_id = current_user_id
      and role = 'SUPER_ADMIN'
  );
end;
$$;

revoke all on function public.is_super_admin()
  from public, anon;

grant execute on function public.is_super_admin()
  to authenticated;

comment on function public.is_super_admin() is
  'Retorna true se o usuario autenticado e SUPER_ADMIN.';


-- ============================================================
-- 3. RPC: has_role (authenticated)
-- ============================================================

create or replace function public.has_role(p_role text)
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
    return false;
  end if;

  if p_role not in ('USER', 'SUPER_ADMIN') then
    raise exception 'Role invalida: %', p_role;
  end if;

  return exists (
    select 1
    from public.user_roles
    where user_id = current_user_id
      and role = p_role
  );
end;
$$;

revoke all on function public.has_role(text)
  from public, anon;

grant execute on function public.has_role(text)
  to authenticated;

comment on function public.has_role(text) is
  'Retorna true se o usuario autenticado possui a role informada.';


-- ============================================================
-- 4. RPC: get_my_roles (authenticated)
-- ============================================================

create or replace function public.get_my_roles()
returns table (
  role text,
  created_at timestamptz
)
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

  return query
  select
    ur.role,
    ur.created_at
  from public.user_roles as ur
  where ur.user_id = current_user_id
  order by ur.created_at desc;
end;
$$;

revoke all on function public.get_my_roles()
  from public, anon;

grant execute on function public.get_my_roles()
  to authenticated;

comment on function public.get_my_roles() is
  'Lista as roles do usuario autenticado.';


-- ============================================================
-- 5. RPC: set_user_role (service_role + super_admin)
-- ============================================================

create or replace function public.set_user_role(
  p_user_id uuid,
  p_role text,
  p_notes text default null,
  p_created_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_role not in ('USER', 'SUPER_ADMIN') then
    raise exception 'Role invalida: %', p_role;
  end if;

  insert into public.user_roles (
    user_id,
    role,
    notes,
    created_by
  )
  values (
    p_user_id,
    p_role,
    p_notes,
    p_created_by
  )
  on conflict (user_id, role) do update
    set notes = excluded.notes;
end;
$$;

revoke all on function public.set_user_role(uuid, text, text, uuid)
  from public, anon, authenticated;

comment on function public.set_user_role(uuid, text, text, uuid) is
  'Define role de um usuario. Apenas service_role.';


-- ============================================================
-- 6. RPC: revoke_user_role (service_role + super_admin)
-- ============================================================

create or replace function public.revoke_user_role(
  p_user_id uuid,
  p_role text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_role not in ('USER', 'SUPER_ADMIN') then
    raise exception 'Role invalida: %', p_role;
  end if;

  delete from public.user_roles
  where user_id = p_user_id
    and role = p_role;

  get diagnostics affected = row_count;

  return affected;
end;
$$;

revoke all on function public.revoke_user_role(uuid, text)
  from public, anon, authenticated;

comment on function public.revoke_user_role(uuid, text) is
  'Remove role de um usuario. Apenas service_role.';


-- ============================================================
-- 7. RPC: admin_list_users (service_role)
-- ============================================================

create or replace function public.admin_list_users(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  roles text[],
  has_active_subscription boolean,
  active_subscription_plan text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    p_limit := 50;
  end if;

  if p_offset is null or p_offset < 0 then
    p_offset := 0;
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.created_at,
    coalesce((
      select array_agg(ur.role order by ur.role)
      from public.user_roles ur
      where ur.user_id = u.id
    ), array[]::text[]),
    exists (
      select 1 from public.subscriptions s
      where s.user_id = u.id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    ),
    (
      select s.plan from public.subscriptions s
      where s.user_id = u.id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
      order by s.created_at desc
      limit 1
    )
  from auth.users as u
  order by u.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.admin_list_users(integer, integer)
  from public, anon, authenticated;

comment on function public.admin_list_users(integer, integer) is
  'Lista usuarios com roles e status de subscription. Apenas service_role.';


-- ============================================================
-- 8. RPC: admin_get_dashboard_stats (service_role)
-- ============================================================

create or replace function public.admin_get_dashboard_stats()
returns table (
  total_users integer,
  total_super_admins integer,
  total_influencers integer,
  total_active_subscriptions integer,
  subscriptions_monthly integer,
  subscriptions_semiannual integer,
  subscriptions_annual integer,
  total_free_personal_active integer,
  total_free_business_active integer,
  total_commissions_pending numeric,
  total_commissions_available numeric,
  total_commissions_paid numeric,
  total_referrals integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    coalesce((select count(*)::integer from auth.users), 0),
    coalesce((
      select count(*)::integer from public.user_roles
      where role = 'SUPER_ADMIN'
    ), 0),
    coalesce((
      select count(*)::integer from public.influencer_profiles
      where is_active = true
    ), 0),
    coalesce((
      select count(*)::integer from public.subscriptions
      where status = 'active'
    ), 0),
    coalesce((
      select count(*)::integer from public.subscriptions
      where status = 'active' and plan = 'monthly'
    ), 0),
    coalesce((
      select count(*)::integer from public.subscriptions
      where status = 'active' and plan = 'semiannual'
    ), 0),
    coalesce((
      select count(*)::integer from public.subscriptions
      where status = 'active' and plan = 'annual'
    ), 0),
    coalesce((
      select count(*)::integer from public.entitlement_grants
      where product = 'personal'
        and source = 'free'
        and status = 'active'
        and (ends_at is null or ends_at > now())
    ), 0),
    coalesce((
      select count(*)::integer from public.entitlement_grants
      where product = 'business'
        and source = 'free'
        and status = 'active'
        and (ends_at is null or ends_at > now())
    ), 0),
    coalesce((
      select sum(commission_amount) from public.referral_commissions
      where status = 'pending'
    ), 0)::numeric,
    coalesce((
      select sum(commission_amount) from public.referral_commissions
      where status = 'available'
    ), 0)::numeric,
    coalesce((
      select sum(commission_amount) from public.referral_commissions
      where status = 'paid'
    ), 0)::numeric,
    coalesce((
      select count(*)::integer from public.referrals
    ), 0);
end;
$$;

revoke all on function public.admin_get_dashboard_stats()
  from public, anon, authenticated;

comment on function public.admin_get_dashboard_stats() is
  'Estatisticas gerais do dashboard admin. Apenas service_role.';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
