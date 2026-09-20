-- ============================================================
-- REFERRAL PURCHASE BONUS
-- Bonus de dias concedido ao indicador quando o indicado PAGA
-- Regras:
--   - Mensal     -> +5 dias (Personal + Business)
--   - Semestral  -> +8 dias (Personal + Business)
--   - Anual      -> +10 dias (Personal + Business)
--   - Apenas no PRIMEIRO pagamento
--   - Cancelamento revoga os grants
-- ============================================================

-- ============================================================
-- 1. HELPER: dias de bonus por tipo de plano
-- ============================================================

create or replace function public.get_referral_bonus_days(
  p_plan_type text
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_plan_type = 'monthly' then
    return 5;
  elsif p_plan_type = 'semiannual' then
    return 8;
  elsif p_plan_type = 'annual' then
    return 10;
  else
    raise exception 'Tipo de plano invalido: %', p_plan_type;
  end if;
end;
$$;

revoke all on function public.get_referral_bonus_days(text)
  from public, anon, authenticated;

comment on function public.get_referral_bonus_days(text) is
  'Retorna dias de bonus por tipo de plano: monthly=5, semiannual=8, annual=10.';


-- ============================================================
-- 2. RPC: grant_referral_purchase_bonus (service_role)
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
  if p_referred_user_id is null then
    raise exception 'p_referred_user_id obrigatorio';
  end if;

  if p_plan_type not in ('monthly', 'semiannual', 'annual') then
    raise exception 'Tipo de plano invalido: %', p_plan_type;
  end if;

  -- Busca referral ativo
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

  -- Calcula dias de bonus
  bonus_days := public.get_referral_bonus_days(p_plan_type);

  -- Idempotencia: verifica se ja existe grant de referral ativo pra esse referred_user_id
  if exists (
    select 1
    from public.entitlement_grants as g
    where g.user_id = referral_record.referrer_user_id
      and g.source = 'referral'
      and g.status = 'active'
      and g.metadata->>'referral_id' = referral_record.referral_id::text
      and g.metadata->>'reason' = 'referral-purchase'
  ) then
    -- Ja foi concedido - retorna os grants existentes
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

  -- Concede grant de Personal
  personal_grant := public.create_bonus_grant(
    p_user_id := referral_record.referrer_user_id,
    p_product := 'personal',
    p_days := bonus_days,
    p_source := 'referral',
    p_reason := 'referral-purchase',
    p_created_by := null,
    p_referral_id := referral_record.referral_id,
    p_metadata := jsonb_build_object(
      'plan_type', p_plan_type,
      'referred_user_id', p_referred_user_id
    )
  );

  -- Concede grant de Business
  business_grant := public.create_bonus_grant(
    p_user_id := referral_record.referrer_user_id,
    p_product := 'business',
    p_days := bonus_days,
    p_source := 'referral',
    p_reason := 'referral-purchase',
    p_created_by := null,
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
  from public, anon, authenticated;

comment on function public.grant_referral_purchase_bonus(uuid, text) is
  'Concede bonus de dias ao indicador quando o indicado paga um plano. Apenas service_role. Idempotente por referred_user_id.';


-- ============================================================
-- 3. RPC: revoke_referral_purchase_bonus (service_role)
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
begin
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
  from public, anon, authenticated;

comment on function public.revoke_referral_purchase_bonus(uuid, text) is
  'Revoga os grants de bonus de referral quando o indicado cancela. Apenas service_role.';


-- ============================================================
-- 4. RPC: list_my_referral_bonus_grants (leitura)
-- ============================================================

create or replace function public.list_my_referral_bonus_grants()
returns table (
  grant_id uuid,
  product text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  days integer,
  plan_type text,
  referral_id text,
  created_at timestamptz,
  revoked_at timestamptz
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
    g.id,
    g.product,
    g.status,
    g.starts_at,
    g.ends_at,
    coalesce((g.metadata->>'days')::integer, 0),
    g.metadata->>'plan_type',
    g.metadata->>'referral_id',
    g.created_at,
    g.revoked_at
  from public.entitlement_grants as g
  where g.user_id = current_user_id
    and g.source = 'referral'
    and g.metadata->>'reason' = 'referral-purchase'
  order by g.created_at desc;
end;
$$;

revoke all on function public.list_my_referral_bonus_grants()
  from public, anon;

grant execute on function public.list_my_referral_bonus_grants()
  to authenticated;

comment on function public.list_my_referral_bonus_grants() is
  'Lista os bonus de referral do usuario autenticado.';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
