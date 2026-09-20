-- ============================================================
-- BONUS LEDGER
-- Sistema de concessao de bonus de dias (referral, admin, etc)
-- Usa entitlement_grants como fonte central (source: bonus/referral)
-- ============================================================

-- ============================================================
-- 1. FUNCAO INTERNA: cria um grant de bonus/experiencia
-- ============================================================

create or replace function public.create_bonus_grant(
  p_user_id uuid,
  p_product text,
  p_days integer,
  p_source text,
  p_reason text,
  p_created_by uuid default null,
  p_referral_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_grant_id uuid;
  existing_grant_id uuid;
begin
  -- Validacoes basicas
  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_product not in ('personal', 'business') then
    raise exception 'Produto invalido: %', p_product;
  end if;

  if p_days is null or p_days <= 0 then
    raise exception 'p_days deve ser maior que zero';
  end if;

  if p_source not in ('bonus', 'referral', 'admin') then
    raise exception 'Source invalida para bonus: %', p_source;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'p_reason obrigatorio';
  end if;

  -- Verifica se usuario existe
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuario nao encontrado: %', p_user_id;
  end if;

  -- Verifica se conta existe (deve existir via trigger on_auth_user_created)
  if not exists (select 1 from public.entitlement_accounts where user_id = p_user_id) then
    raise exception 'Conta de entitlement nao encontrada: %', p_user_id;
  end if;

  -- Idempotencia: se p_referral_id foi passado, verifica se ja existe
  -- um grant de bonus/referral com esse referral_id no metadata
  if p_referral_id is not null then
    select id into existing_grant_id
    from public.entitlement_grants
    where user_id = p_user_id
      and product = p_product
      and source = p_source
      and status = 'active'
      and metadata->>'referral_id' = p_referral_id::text
    limit 1;

    if existing_grant_id is not null then
      return existing_grant_id;
    end if;
  end if;

  -- Cria o grant
  insert into public.entitlement_grants (
    user_id,
    product,
    source,
    status,
    starts_at,
    ends_at,
    external_reference,
    metadata,
    created_by
  )
  values (
    p_user_id,
    p_product,
    p_source,
    'active',
    now(),
    now() + (p_days || ' days')::interval,
    'bonus-' || gen_random_uuid()::text,
    jsonb_build_object(
      'days', p_days,
      'reason', p_reason,
      'referral_id', p_referral_id,
      'granted_at', now()
    ) || p_metadata,
    p_created_by
  )
  returning id into new_grant_id;

  return new_grant_id;
end;
$$;

revoke all on function public.create_bonus_grant(
  uuid, text, integer, text, text, uuid, uuid, jsonb
) from public, anon, authenticated;

comment on function public.create_bonus_grant(
  uuid, text, integer, text, text, uuid, uuid, jsonb
) is
  'Cria um grant de bonus de dias. Apenas service_role. Idempotente por referral_id.';


-- ============================================================
-- 2. RPC PUBLICA: conceder bonus via service_role
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
  return public.create_bonus_grant(
    p_user_id := p_user_id,
    p_product := p_product,
    p_days := p_days,
    p_source := 'bonus',
    p_reason := p_reason,
    p_created_by := null,
    p_referral_id := p_referral_id,
    p_metadata := '{"granted_via":"grant_bonus_days"}'::jsonb
  );
end;
$$;

revoke all on function public.grant_bonus_days(
  uuid, text, integer, text, uuid
) from public, anon, authenticated;

comment on function public.grant_bonus_days(
  uuid, text, integer, text, uuid
) is
  'Concede bonus generico de dias. Apenas service_role.';


-- ============================================================
-- 3. RPC PUBLICA: conceder bonus via admin (com nota)
-- ============================================================

create or replace function public.admin_grant_bonus_days(
  p_user_id uuid,
  p_product text,
  p_days integer,
  p_reason text,
  p_admin_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.create_bonus_grant(
    p_user_id := p_user_id,
    p_product := p_product,
    p_days := p_days,
    p_source := 'admin',
    p_reason := p_reason,
    p_created_by := p_admin_id,
    p_referral_id := null,
    p_metadata := '{"granted_via":"admin_grant_bonus_days"}'::jsonb
  );
end;
$$;

revoke all on function public.admin_grant_bonus_days(
  uuid, text, integer, text, uuid
) from public, anon, authenticated;

comment on function public.admin_grant_bonus_days(
  uuid, text, integer, text, uuid
) is
  'Concede bonus via acao de admin. Apenas service_role.';


-- ============================================================
-- 4. RPC PUBLICA: conceder bonus via referral signup
-- ============================================================

create or replace function public.grant_referral_signup_bonus(
  p_referrer_id uuid,
  p_referred_user_id uuid,
  p_product text,
  p_days integer default 7,
  p_referral_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_referrer_id = p_referred_user_id then
    raise exception 'Auto-indicacao nao permitida';
  end if;

  return public.create_bonus_grant(
    p_user_id := p_referrer_id,
    p_product := p_product,
    p_days := p_days,
    p_source := 'referral',
    p_reason := 'referral-signup',
    p_created_by := null,
    p_referral_id := p_referral_id,
    p_metadata := jsonb_build_object(
      'granted_via', 'grant_referral_signup_bonus',
      'referred_user_id', p_referred_user_id
    )
  );
end;
$$;

revoke all on function public.grant_referral_signup_bonus(
  uuid, uuid, text, integer, uuid
) from public, anon, authenticated;

comment on function public.grant_referral_signup_bonus(
  uuid, uuid, text, integer, uuid
) is
  'Concede bonus de dias por indicacao de signup. Apenas service_role.';


-- ============================================================
-- 5. RPC PUBLICA: revogar um grant de bonus
-- ============================================================

create or replace function public.revoke_bonus_grant(
  p_grant_id uuid,
  p_revoked_by uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_grant record;
begin
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
    revoked_by = p_revoked_by,
    metadata = metadata || jsonb_build_object(
      'revoked_reason', p_reason,
      'revoked_via', 'revoke_bonus_grant'
    )
  where id = p_grant_id;
end;
$$;

revoke all on function public.revoke_bonus_grant(
  uuid, uuid, text
) from public, anon, authenticated;

comment on function public.revoke_bonus_grant(
  uuid, uuid, text
) is
  'Revoga um grant de bonus. Apenas service_role.';


-- ============================================================
-- 6. RPC DE LEITURA: listar bonus do proprio usuario
-- ============================================================

create or replace function public.list_my_bonus_grants()
returns table (
  grant_id uuid,
  product text,
  source text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  days integer,
  reason text,
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
    grant_row.id,
    grant_row.product,
    grant_row.source,
    grant_row.status,
    grant_row.starts_at,
    grant_row.ends_at,
    coalesce((grant_row.metadata->>'days')::integer, 0),
    grant_row.metadata->>'reason',
    grant_row.metadata->>'referral_id',
    grant_row.created_at,
    grant_row.revoked_at
  from public.entitlement_grants as grant_row
  where grant_row.user_id = current_user_id
    and grant_row.source in ('bonus', 'referral', 'admin')
  order by grant_row.created_at desc;
end;
$$;

revoke all on function public.list_my_bonus_grants()
  from public, anon;

grant execute on function public.list_my_bonus_grants()
  to authenticated;

comment on function public.list_my_bonus_grants() is
  'Lista todos os grants de bonus do usuario autenticado.';


-- ============================================================
-- 7. RPC DE LEITURA: resumo de bonus do proprio usuario
-- ============================================================

create or replace function public.get_my_bonus_summary()
returns table (
  total_active_grants integer,
  total_days_active integer,
  total_days_ever integer,
  total_revoked_grants integer,
  last_grant_at timestamptz
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
    count(*) filter (where grant_row.status = 'active')::integer,
    coalesce(sum(
      case
        when grant_row.status = 'active'
        then greatest(
          0,
          ceil(extract(epoch from (
            least(grant_row.ends_at, now() + interval '100 years') - grant_row.starts_at
          )) / 86400)
        )::integer
        else 0
      end
    ), 0)::integer,
    coalesce(sum((grant_row.metadata->>'days')::integer), 0)::integer,
    count(*) filter (where grant_row.status = 'revoked')::integer,
    max(grant_row.created_at)
  from public.entitlement_grants as grant_row
  where grant_row.user_id = current_user_id
    and grant_row.source in ('bonus', 'referral', 'admin');
end;
$$;

revoke all on function public.get_my_bonus_summary()
  from public, anon;

grant execute on function public.get_my_bonus_summary()
  to authenticated;

comment on function public.get_my_bonus_summary() is
  'Resumo agregado dos bonus do usuario autenticado.';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================

-- ============================================================
-- 8. INDICE UNICO: garante idempotencia real por referral_id
-- ============================================================

create unique index entitlement_grants_bonus_referral_uidx
  on public.entitlement_grants (
    user_id,
    product,
    source,
    (metadata->>'referral_id')
  )
  where source in ('bonus', 'referral', 'admin')
    and metadata->>'referral_id' is not null
    and status = 'active';

comment on index public.entitlement_grants_bonus_referral_uidx is
  'Garante que um mesmo referral_id nao gere dois grants de bonus ativos.';
