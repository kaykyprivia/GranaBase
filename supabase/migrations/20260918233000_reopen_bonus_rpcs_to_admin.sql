-- ============================================================
-- REOPEN BONUS/REFERRAL RPCs TO SUPER ADMIN
-- Antes: service_role only
-- Agora: service_role OR is_super_admin()
-- ============================================================

-- ============================================================
-- 1. grant_bonus_days
-- ============================================================

create or replace function public.grant_bonus_days(
  p_user_id uuid,
  p_product text,
  p_days integer,
  p_reason text,
  p_referral_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  return public.create_bonus_grant(
    p_user_id := p_user_id,
    p_product := p_product,
    p_days := p_days,
    p_source := 'bonus',
    p_reason := p_reason,
    p_created_by := auth.uid(),
    p_referral_id := p_referral_id,
    p_metadata := '{"granted_via":"grant_bonus_days"}'::jsonb
  );
end;
$$;

revoke all on function public.grant_bonus_days(uuid, text, integer, text, uuid)
  from public, anon;

grant execute on function public.grant_bonus_days(uuid, text, integer, text, uuid)
  to authenticated;

comment on function public.grant_bonus_days(uuid, text, integer, text, uuid) is
  'Concede bonus generico de dias. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 2. admin_grant_bonus_days
-- ============================================================

create or replace function public.admin_grant_bonus_days(
  p_user_id uuid,
  p_product text,
  p_days integer,
  p_reason text
)
returns uuid
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

  return public.create_bonus_grant(
    p_user_id := p_user_id,
    p_product := p_product,
    p_days := p_days,
    p_source := 'admin',
    p_reason := p_reason,
    p_created_by := current_user_id,
    p_referral_id := null,
    p_metadata := '{"granted_via":"admin_grant_bonus_days"}'::jsonb
  );
end;
$$;

revoke all on function public.admin_grant_bonus_days(uuid, text, integer, text)
  from public, anon;

grant execute on function public.admin_grant_bonus_days(uuid, text, integer, text)
  to authenticated;

comment on function public.admin_grant_bonus_days(uuid, text, integer, text) is
  'Concede bonus via acao de admin. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 3. revoke_bonus_grant
-- ============================================================

create or replace function public.revoke_bonus_grant(
  p_grant_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_grant record;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'p_reason obrigatorio';
  end if;

  select id, status, source
  into target_grant
  from public.entitlement_grants
  where id = p_grant_id
  for update;

  if not found then
    raise exception 'Grant nao encontrado: %', p_grant_id;
  end if;

  if target_grant.status = 'revoked' then
    return;
  end if;

  if target_grant.source not in ('bonus', 'referral', 'admin') then
    raise exception 'Apenas grants de bonus/referral/admin podem ser revogados por esta funcao. Source atual: %',
      target_grant.source;
  end if;

  update public.entitlement_grants
  set
    status = 'revoked',
    revoked_at = now(),
    revoked_by = current_user_id,
    metadata = metadata || jsonb_build_object(
      'revoked_reason', p_reason,
      'revoked_via', 'revoke_bonus_grant'
    )
  where id = p_grant_id;
end;
$$;

revoke all on function public.revoke_bonus_grant(uuid, text)
  from public, anon;

grant execute on function public.revoke_bonus_grant(uuid, text)
  to authenticated;

comment on function public.revoke_bonus_grant(uuid, text) is
  'Revoga um grant de bonus. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 4. grant_referral_purchase_bonus
-- ============================================================

create or replace function public.grant_referral_purchase_bonus(
  p_referred_user_id uuid,
  p_plan_type text
)
returns table (
  referral_id uuid,
  bonus_days integer,
  personal_grant_id uuid,
  business_grant_id uuid,
  already_granted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  referral_record record;
  bonus_days integer;
  personal_grant uuid;
  business_grant uuid;
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

  select
    r.id as referral_id,
    r.referrer_user_id,
    r.referred_user_id
  into referral_record
  from public.referrals as r
  where r.referred_user_id = p_referred_user_id;

  if referral_record.referral_id is null then
    raise exception 'Usuario % nao foi indicado por ninguem', p_referred_user_id;
  end if;

  bonus_days := public.get_referral_bonus_days(p_plan_type);

  if exists (
    select 1
    from public.entitlement_grants as g
    where g.user_id = referral_record.referrer_user_id
      and g.source = 'referral'
      and g.status = 'active'
      and g.metadata->>'referral_id' = referral_record.referral_id::text
      and g.metadata->>'reason' = 'referral-purchase'
  ) then
    select
      max(case when g.product = 'personal' then g.id end),
      max(case when g.product = 'business' then g.id end)
    into personal_grant, business_grant
    from public.entitlement_grants as g
    where g.user_id = referral_record.referrer_user_id
      and g.source = 'referral'
      and g.status = 'active'
      and g.metadata->>'referral_id' = referral_record.referral_id::text
      and g.metadata->>'reason' = 'referral-purchase';

    return query select
      referral_record.referral_id,
      bonus_days,
      personal_grant,
      business_grant,
      true;
    return;
  end if;

  personal_grant := public.create_bonus_grant(
    p_user_id := referral_record.referrer_user_id,
    p_product := 'personal',
    p_days := bonus_days,
    p_source := 'referral',
    p_reason := 'referral-purchase',
    p_created_by := auth.uid(),
    p_referral_id := referral_record.referral_id,
    p_metadata := jsonb_build_object(
      'plan_type', p_plan_type,
      'referred_user_id', p_referred_user_id
    )
  );

  business_grant := public.create_bonus_grant(
    p_user_id := referral_record.referrer_user_id,
    p_product := 'business',
    p_days := bonus_days,
    p_source := 'referral',
    p_reason := 'referral-purchase',
    p_created_by := auth.uid(),
    p_referral_id := referral_record.referral_id,
    p_metadata := jsonb_build_object(
      'plan_type', p_plan_type,
      'referred_user_id', p_referred_user_id
    )
  );

  return query select
    referral_record.referral_id,
    bonus_days,
    personal_grant,
    business_grant,
    false;
end;
$$;

revoke all on function public.grant_referral_purchase_bonus(uuid, text)
  from public, anon;

grant execute on function public.grant_referral_purchase_bonus(uuid, text)
  to authenticated;

comment on function public.grant_referral_purchase_bonus(uuid, text) is
  'Concede bonus de referral. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 5. revoke_referral_purchase_bonus
-- ============================================================

create or replace function public.revoke_referral_purchase_bonus(
  p_referral_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  referral_record record;
  revoked_count integer := 0;
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

  select
    r.id,
    r.referrer_user_id
  into referral_record
  from public.referrals as r
  where r.id = p_referral_id;

  if referral_record.id is null then
    raise exception 'Referral nao encontrado: %', p_referral_id;
  end if;

  update public.entitlement_grants
  set
    status = 'revoked',
    revoked_at = now(),
    revoked_by = current_user_id,
    metadata = metadata || jsonb_build_object(
      'revoked_reason', p_reason,
      'revoked_via', 'revoke_referral_purchase_bonus'
    )
  where user_id = referral_record.referrer_user_id
    and source = 'referral'
    and status = 'active'
    and metadata->>'referral_id' = p_referral_id::text
    and metadata->>'reason' = 'referral-purchase';

  get diagnostics revoked_count = row_count;

  return revoked_count;
end;
$$;

revoke all on function public.revoke_referral_purchase_bonus(uuid, text)
  from public, anon;

grant execute on function public.revoke_referral_purchase_bonus(uuid, text)
  to authenticated;

comment on function public.revoke_referral_purchase_bonus(uuid, text) is
  'Revoga bonus de referral. service_role ou SUPER_ADMIN.';


-- ============================================================
-- 6. PROMOVER kaykyeluiza@gmail.com COMO SUPER_ADMIN
-- ============================================================

insert into public.user_roles (user_id, role, notes)
select
  u.id,
  'SUPER_ADMIN',
  'Promovido na migration inicial de admin'
from auth.users as u
where u.email = 'kaykyeluiza@gmail.com'
on conflict (user_id, role) do nothing;


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
