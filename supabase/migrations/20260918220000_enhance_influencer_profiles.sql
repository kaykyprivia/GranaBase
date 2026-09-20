-- ============================================================
-- ENHANCE INFLUENCER PROFILES
-- - Concede acesso PAID_FULL automaticamente ao marcar como influencer
-- - RPC para revogar
-- - RPCs de stats (admin)
-- ============================================================

-- ============================================================
-- 1. HELPER: conceder acesso de influencer
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
declare
  external_ref_personal text;
  external_ref_business text;
begin
  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  external_ref_personal := 'influencer-personal-v1';
  external_ref_business := 'influencer-business-v1';

  -- Personal: acesso vitalicio enquanto influencer
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
    p_user_id,
    'personal',
    'admin',
    'active',
    now(),
    null,
    external_ref_personal,
    jsonb_build_object(
      'reason', p_reason,
      'granted_via', 'grant_influencer_access'
    )
  )
  on conflict (user_id, product, source, external_reference)
    where external_reference is not null
    do nothing;

  -- Business: acesso vitalicio enquanto influencer
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
    p_user_id,
    'business',
    'admin',
    'active',
    now(),
    null,
    external_ref_business,
    jsonb_build_object(
      'reason', p_reason,
      'granted_via', 'grant_influencer_access'
    )
  )
  on conflict (user_id, product, source, external_reference)
    where external_reference is not null
    do nothing;
end;
$$;

revoke all on function public.grant_influencer_access(uuid, text)
  from public, anon, authenticated;

comment on function public.grant_influencer_access(uuid, text) is
  'Concede acesso PAID_FULL (personal + business) para influencer. Apenas service_role.';


-- ============================================================
-- 2. RPC: revoke_influencer
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
  affected integer := 0;
  revoked_grants integer := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'p_reason obrigatorio';
  end if;

  -- Desativa influencer
  update public.influencer_profiles
  set
    is_active = false,
    updated_at = now()
  where user_id = p_user_id
    and is_active = true;

  get diagnostics affected = row_count;

  -- Revoga grants de influencer
  update public.entitlement_grants
  set
    status = 'revoked',
    revoked_at = now(),
    metadata = metadata || jsonb_build_object(
      'revoked_reason', p_reason,
      'revoked_via', 'revoke_influencer'
    )
  where user_id = p_user_id
    and source = 'admin'
    and status = 'active'
    and external_reference in (
      'influencer-personal-v1',
      'influencer-business-v1'
    );

  get diagnostics revoked_grants = row_count;

  return revoked_grants;
end;
$$;

revoke all on function public.revoke_influencer(uuid, text)
  from public, anon, authenticated;

comment on function public.revoke_influencer(uuid, text) is
  'Revoga acesso de influencer. Apenas service_role.';


-- ============================================================
-- 3. RPC: admin_get_influencer_stats
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
  if p_influencer_user_id is null then
    raise exception 'p_influencer_user_id obrigatorio';
  end if;

  return query
  select
    ip.user_id,
    ip.is_active,
    ip.custom_commission_rate,
    ip.created_at,
    coalesce((
      select count(*)::integer
      from public.referrals r
      where r.referrer_user_id = p_influencer_user_id
    ), 0),
    coalesce((
      select count(distinct rc.referral_id)::integer
      from public.referral_commissions rc
      where rc.referrer_user_id = p_influencer_user_id
    ), 0),
    coalesce((
      select sum(rc.commission_amount)
      from public.referral_commissions rc
      where rc.referrer_user_id = p_influencer_user_id
    ), 0)::numeric,
    coalesce((
      select sum(rc.commission_amount)
      from public.referral_commissions rc
      where rc.referrer_user_id = p_influencer_user_id
        and rc.status = 'paid'
    ), 0)::numeric,
    coalesce((
      select sum(rc.commission_amount)
      from public.referral_commissions rc
      where rc.referrer_user_id = p_influencer_user_id
        and rc.status in ('pending', 'available')
    ), 0)::numeric
  from public.influencer_profiles ip
  where ip.user_id = p_influencer_user_id;
end;
$$;

revoke all on function public.admin_get_influencer_stats(uuid)
  from public, anon, authenticated;

comment on function public.admin_get_influencer_stats(uuid) is
  'Retorna stats de um influencer. Apenas service_role (por enquanto).';


-- ============================================================
-- 4. RPC: admin_list_influencers
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
  return query
  select
    ip.user_id,
    ip.is_active,
    ip.custom_commission_rate,
    ip.notes,
    ip.created_at,
    coalesce((
      select count(*)::integer
      from public.referrals r
      where r.referrer_user_id = ip.user_id
    ), 0),
    coalesce((
      select sum(rc.commission_amount)
      from public.referral_commissions rc
      where rc.referrer_user_id = ip.user_id
    ), 0)::numeric
  from public.influencer_profiles ip
  order by ip.created_at desc;
end;
$$;

revoke all on function public.admin_list_influencers()
  from public, anon, authenticated;

comment on function public.admin_list_influencers() is
  'Lista influencers. Apenas service_role (por enquanto).';


-- ============================================================
-- 5. RPC: admin_get_referral_overview
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
  return query
  select
    coalesce((select count(*)::integer from public.referrals), 0),
    coalesce((
      select count(distinct referrer_user_id)::integer
      from public.referrals
    ), 0),
    coalesce((
      select count(distinct referral_id)::integer
      from public.referral_commissions
      where status != 'cancelled'
    ), 0),
    coalesce((
      select sum(commission_amount) from public.referral_commissions
    ), 0)::numeric,
    coalesce((
      select sum(commission_amount) from public.referral_commissions
      where status = 'paid'
    ), 0)::numeric,
    coalesce((
      select sum(commission_amount) from public.referral_commissions
      where status in ('pending', 'available')
    ), 0)::numeric,
    coalesce((
      select sum(commission_amount) from public.referral_commissions
      where status = 'cancelled'
    ), 0)::numeric;
end;
$$;

revoke all on function public.admin_get_referral_overview()
  from public, anon, authenticated;

comment on function public.admin_get_referral_overview() is
  'Visao geral do sistema de referrals. Apenas service_role (por enquanto).';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
