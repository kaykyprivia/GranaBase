-- ============================================================
-- REOPEN ADMIN RPCs TO SUPER ADMIN
-- Antes: service_role only
-- Agora: service_role OR is_super_admin()
-- 12 RPCs: commissions, influencers, roles, admin stats
-- ============================================================

-- ============================================================
-- 1. create_referral_commission
-- ============================================================

create or replace function public.create_referral_commission(
  p_referred_user_id uuid,
  p_plan_type text,
  p_base_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  referral_record record;
  rate_record record;
  monthly_equivalent numeric;
  commission numeric;
  new_commission_id uuid;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_referred_user_id is null then
    raise exception 'p_referred_user_id obrigatorio';
  end if;

  if p_plan_type not in ('monthly', 'semiannual', 'annual') then
    raise exception 'Tipo de plano invalido: %', p_plan_type;
  end if;

  if p_base_amount is null or p_base_amount <= 0 then
    raise exception 'Valor base invalido';
  end if;

  select
    r.id as referral_id,
    r.referrer_user_id,
    r.referred_user_id
  into referral_record
  from public.referrals as r
  where r.referred_user_id = p_referred_user_id;

  if referral_record.referral_id is null then
    raise exception 'Usuario % nao foi indicado', p_referred_user_id;
  end if;

  select id into new_commission_id
  from public.referral_commissions
  where referral_id = referral_record.referral_id
    and status != 'cancelled'
  limit 1;

  if new_commission_id is not null then
    return new_commission_id;
  end if;

  select * into rate_record
  from public.get_referrer_commission_rate(referral_record.referrer_user_id);

  monthly_equivalent := public.get_monthly_equivalent_amount(p_plan_type, p_base_amount);
  commission := round(monthly_equivalent * rate_record.rate / 100, 2);

  insert into public.referral_commissions (
    referral_id,
    referrer_user_id,
    referred_user_id,
    plan_type,
    referrer_plan_at_event,
    commission_rate_snapshot,
    base_amount,
    monthly_equivalent_amount,
    commission_amount,
    status,
    metadata
  )
  values (
    referral_record.referral_id,
    referral_record.referrer_user_id,
    p_referred_user_id,
    p_plan_type,
    rate_record.source,
    rate_record.rate,
    p_base_amount,
    monthly_equivalent,
    commission,
    'pending',
    jsonb_build_object(
      'created_via', 'create_referral_commission',
      'created_by_admin', auth.uid(),
      'computed_at', now()
    )
  )
  returning id into new_commission_id;

  perform public.recompute_commission_availability(referral_record.referrer_user_id);

  return new_commission_id;
end;
$$;

revoke all on function public.create_referral_commission(uuid, text, numeric)
  from public, anon;

grant execute on function public.create_referral_commission(uuid, text, numeric)
  to authenticated;

comment on function public.create_referral_commission(uuid, text, numeric) is
  'Cria comissao para o indicador. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 2. cancel_referral_commission
-- ============================================================

create or replace function public.cancel_referral_commission(
  p_referral_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer := 0;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_referral_id is null then
    raise exception 'p_referral_id obrigatorio';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'p_reason obrigatorio';
  end if;

  update public.referral_commissions
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = p_reason,
    cancelled_by = current_user_id,
    metadata = metadata || jsonb_build_object(
      'cancelled_via', 'cancel_referral_commission'
    )
  where referral_id = p_referral_id
    and status in ('pending', 'available');

  get diagnostics affected = row_count;

  return affected;
end;
$$;

revoke all on function public.cancel_referral_commission(uuid, text)
  from public, anon;

grant execute on function public.cancel_referral_commission(uuid, text)
  to authenticated;

comment on function public.cancel_referral_commission(uuid, text) is
  'Cancela comissoes de um referral. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 3. set_user_as_influencer
-- ============================================================

create or replace function public.set_user_as_influencer(
  p_user_id uuid,
  p_custom_rate numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_custom_rate is null
    or p_custom_rate < 0
    or p_custom_rate > 100 then
    raise exception 'Taxa invalida: deve estar entre 0 e 100';
  end if;

  insert into public.influencer_profiles (
    user_id,
    custom_commission_rate,
    notes,
    created_by,
    is_active
  )
  values (
    p_user_id,
    p_custom_rate,
    p_notes,
    current_user_id,
    true
  )
  on conflict (user_id) do update
    set
      custom_commission_rate = excluded.custom_commission_rate,
      notes = excluded.notes,
      is_active = true,
      updated_at = now();

  -- Concede acesso total automaticamente
  perform public.grant_influencer_access(p_user_id, 'set_user_as_influencer');
end;
$$;

revoke all on function public.set_user_as_influencer(uuid, numeric, text)
  from public, anon;

grant execute on function public.set_user_as_influencer(uuid, numeric, text)
  to authenticated;

comment on function public.set_user_as_influencer(uuid, numeric, text) is
  'Define usuario como influencer + concede acesso. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 4. grant_influencer_access
-- ============================================================

create or replace function public.grant_influencer_access(
  p_user_id uuid,
  p_reason text default 'influencer-grant'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  insert into public.entitlement_grants (
    user_id, product, source, status, starts_at, ends_at, external_reference, metadata
  )
  values (
    p_user_id, 'personal', 'admin', 'active', now(), null,
    'influencer-personal-v1',
    jsonb_build_object('reason', p_reason, 'granted_via', 'grant_influencer_access')
  )
  on conflict (user_id, product, source, external_reference)
    where external_reference is not null
    do nothing;

  insert into public.entitlement_grants (
    user_id, product, source, status, starts_at, ends_at, external_reference, metadata
  )
  values (
    p_user_id, 'business', 'admin', 'active', now(), null,
    'influencer-business-v1',
    jsonb_build_object('reason', p_reason, 'granted_via', 'grant_influencer_access')
  )
  on conflict (user_id, product, source, external_reference)
    where external_reference is not null
    do nothing;
end;
$$;

revoke all on function public.grant_influencer_access(uuid, text)
  from public, anon;

grant execute on function public.grant_influencer_access(uuid, text)
  to authenticated;

comment on function public.grant_influencer_access(uuid, text) is
  'Concede acesso PAID_FULL para influencer. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 5. revoke_influencer
-- ============================================================

create or replace function public.revoke_influencer(
  p_user_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_grants integer := 0;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'p_reason obrigatorio';
  end if;

  update public.influencer_profiles
  set is_active = false, updated_at = now()
  where user_id = p_user_id and is_active = true;

  update public.entitlement_grants
  set
    status = 'revoked',
    revoked_at = now(),
    revoked_by = current_user_id,
    metadata = metadata || jsonb_build_object(
      'revoked_reason', p_reason,
      'revoked_via', 'revoke_influencer'
    )
  where user_id = p_user_id
    and source = 'admin'
    and status = 'active'
    and external_reference in ('influencer-personal-v1', 'influencer-business-v1');

  get diagnostics revoked_grants = row_count;

  return revoked_grants;
end;
$$;

revoke all on function public.revoke_influencer(uuid, text)
  from public, anon;

grant execute on function public.revoke_influencer(uuid, text)
  to authenticated;

comment on function public.revoke_influencer(uuid, text) is
  'Revoga acesso de influencer. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 6. admin_get_influencer_stats
-- ============================================================

create or replace function public.admin_get_influencer_stats(
  p_influencer_user_id uuid
)
returns table (
  user_id uuid,
  is_active boolean,
  custom_commission_rate numeric,
  created_at timestamptz,
  total_referrals integer,
  total_paid_referrals integer,
  total_commission_generated numeric,
  total_commission_paid numeric,
  total_commission_pending numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_influencer_user_id is null then
    raise exception 'p_influencer_user_id obrigatorio';
  end if;

  return query
  select
    ip.user_id,
    ip.is_active,
    ip.custom_commission_rate,
    ip.created_at,
    coalesce((select count(*)::integer from public.referrals r where r.referrer_user_id = p_influencer_user_id), 0),
    coalesce((select count(distinct rc.referral_id)::integer from public.referral_commissions rc where rc.referrer_user_id = p_influencer_user_id), 0),
    coalesce((select sum(rc.commission_amount) from public.referral_commissions rc where rc.referrer_user_id = p_influencer_user_id), 0)::numeric,
    coalesce((select sum(rc.commission_amount) from public.referral_commissions rc where rc.referrer_user_id = p_influencer_user_id and rc.status = 'paid'), 0)::numeric,
    coalesce((select sum(rc.commission_amount) from public.referral_commissions rc where rc.referrer_user_id = p_influencer_user_id and rc.status in ('pending', 'available')), 0)::numeric
  from public.influencer_profiles ip
  where ip.user_id = p_influencer_user_id;
end;
$$;

revoke all on function public.admin_get_influencer_stats(uuid)
  from public, anon;

grant execute on function public.admin_get_influencer_stats(uuid)
  to authenticated;

comment on function public.admin_get_influencer_stats(uuid) is
  'Stats de um influencer. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 7. admin_list_influencers
-- ============================================================

create or replace function public.admin_list_influencers()
returns table (
  user_id uuid,
  is_active boolean,
  custom_commission_rate numeric,
  notes text,
  created_at timestamptz,
  total_referrals integer,
  total_commission_generated numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  return query
  select
    ip.user_id,
    ip.is_active,
    ip.custom_commission_rate,
    ip.notes,
    ip.created_at,
    coalesce((select count(*)::integer from public.referrals r where r.referrer_user_id = ip.user_id), 0),
    coalesce((select sum(rc.commission_amount) from public.referral_commissions rc where rc.referrer_user_id = ip.user_id), 0)::numeric
  from public.influencer_profiles ip
  order by ip.created_at desc;
end;
$$;

revoke all on function public.admin_list_influencers()
  from public, anon;

grant execute on function public.admin_list_influencers()
  to authenticated;

comment on function public.admin_list_influencers() is
  'Lista influencers. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 8. admin_get_referral_overview
-- ============================================================

create or replace function public.admin_get_referral_overview()
returns table (
  total_referrals integer,
  total_referrers integer,
  total_converted integer,
  total_commission_generated numeric,
  total_commission_paid numeric,
  total_commission_pending numeric,
  total_commission_cancelled numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  return query
  select
    coalesce((select count(*)::integer from public.referrals), 0),
    coalesce((select count(distinct referrer_user_id)::integer from public.referrals), 0),
    coalesce((select count(distinct referral_id)::integer from public.referral_commissions where status != 'cancelled'), 0),
    coalesce((select sum(commission_amount) from public.referral_commissions), 0)::numeric,
    coalesce((select sum(commission_amount) from public.referral_commissions where status = 'paid'), 0)::numeric,
    coalesce((select sum(commission_amount) from public.referral_commissions where status in ('pending', 'available')), 0)::numeric,
    coalesce((select sum(commission_amount) from public.referral_commissions where status = 'cancelled'), 0)::numeric;
end;
$$;

revoke all on function public.admin_get_referral_overview()
  from public, anon;

grant execute on function public.admin_get_referral_overview()
  to authenticated;

comment on function public.admin_get_referral_overview() is
  'Visao geral do sistema de referrals. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 9. set_user_role
-- ============================================================

create or replace function public.set_user_role(
  p_user_id uuid,
  p_role text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_role not in ('USER', 'SUPER_ADMIN') then
    raise exception 'Role invalida: %', p_role;
  end if;

  insert into public.user_roles (user_id, role, notes, created_by)
  values (p_user_id, p_role, p_notes, current_user_id)
  on conflict (user_id, role) do update
    set notes = excluded.notes;
end;
$$;

revoke all on function public.set_user_role(uuid, text, text)
  from public, anon;

grant execute on function public.set_user_role(uuid, text, text)
  to authenticated;

comment on function public.set_user_role(uuid, text, text) is
  'Define role de um usuario. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 10. revoke_user_role
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
  current_user_id uuid := auth.uid();
begin
  if current_user_id is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_role not in ('USER', 'SUPER_ADMIN') then
    raise exception 'Role invalida: %', p_role;
  end if;

  if p_user_id = current_user_id and p_role = 'SUPER_ADMIN' then
    raise exception 'Nao e possivel remover seu proprio SUPER_ADMIN';
  end if;

  delete from public.user_roles
  where user_id = p_user_id and role = p_role;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.revoke_user_role(uuid, text)
  from public, anon;

grant execute on function public.revoke_user_role(uuid, text)
  to authenticated;

comment on function public.revoke_user_role(uuid, text) is
  'Remove role de um usuario. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 11. admin_list_users
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
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

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
      from public.user_roles ur where ur.user_id = u.id
    ), array[]::text[]),
    exists (
      select 1 from public.subscriptions s
      where s.user_id = u.id and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    ),
    (
      select s.plan from public.subscriptions s
      where s.user_id = u.id and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
      order by s.created_at desc limit 1
    )
  from auth.users as u
  order by u.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.admin_list_users(integer, integer)
  from public, anon;

grant execute on function public.admin_list_users(integer, integer)
  to authenticated;

comment on function public.admin_list_users(integer, integer) is
  'Lista usuarios com roles. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 12. admin_get_dashboard_stats
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
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  return query
  select
    coalesce((select count(*)::integer from auth.users), 0),
    coalesce((select count(*)::integer from public.user_roles where role = 'SUPER_ADMIN'), 0),
    coalesce((select count(*)::integer from public.influencer_profiles where is_active = true), 0),
    coalesce((select count(*)::integer from public.subscriptions where status = 'active'), 0),
    coalesce((select count(*)::integer from public.subscriptions where status = 'active' and plan = 'monthly'), 0),
    coalesce((select count(*)::integer from public.subscriptions where status = 'active' and plan = 'semiannual'), 0),
    coalesce((select count(*)::integer from public.subscriptions where status = 'active' and plan = 'annual'), 0),
    coalesce((select count(*)::integer from public.entitlement_grants where product = 'personal' and source = 'free' and status = 'active' and (ends_at is null or ends_at > now())), 0),
    coalesce((select count(*)::integer from public.entitlement_grants where product = 'business' and source = 'free' and status = 'active' and (ends_at is null or ends_at > now())), 0),
    coalesce((select sum(commission_amount) from public.referral_commissions where status = 'pending'), 0)::numeric,
    coalesce((select sum(commission_amount) from public.referral_commissions where status = 'available'), 0)::numeric,
    coalesce((select sum(commission_amount) from public.referral_commissions where status = 'paid'), 0)::numeric,
    coalesce((select count(*)::integer from public.referrals), 0);
end;
$$;

revoke all on function public.admin_get_dashboard_stats()
  from public, anon;

grant execute on function public.admin_get_dashboard_stats()
  to authenticated;

comment on function public.admin_get_dashboard_stats() is
  'Estatisticas gerais do dashboard admin. service_role ou SUPER_ADMIN.';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
