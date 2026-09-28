-- ============================================================
-- FIX: Bonus empilha ao inves de sobrescrever
-- + Nova RPC: get_my_product_access_status
-- ============================================================

-- ============================================================
-- 1. Reescreve create_bonus_grant para EMPILHAR
--    Antes: ends_at = now() + days
--    Depois: starts_at = MAX(ends_at_ativo, now())
--            ends_at   = starts_at + days
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
  last_ends_at timestamptz;
  new_starts_at timestamptz;
  new_ends_at timestamptz;
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

  -- Verifica se conta existe
  if not exists (select 1 from public.entitlement_accounts where user_id = p_user_id) then
    raise exception 'Conta de entitlement nao encontrada: %', p_user_id;
  end if;

  -- Idempotencia por referral_id
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

  -- EMPILHAMENTO: encontra o maior ends_at entre grants ativos do mesmo produto
  -- Se nao existir, comeca de agora
  select max(g.ends_at)
  into last_ends_at
  from public.entitlement_grants g
  where g.user_id = p_user_id
    and g.product = p_product
    and g.status = 'active'
    and g.ends_at is not null
    and g.ends_at > now();

  -- Se o grant atual nunca expira (ends_at NULL), bonus vai depois de 100 anos
  -- (na pratica, empilha depois do infinito — mas isso nao deve acontecer)
  if exists (
    select 1 from public.entitlement_grants g
    where g.user_id = p_user_id
      and g.product = p_product
      and g.status = 'active'
      and g.ends_at is null
  ) then
    -- Ja tem acesso infinito. Bonus e irrelevante, mas registra mesmo assim.
    last_ends_at := now();
  end if;

  -- Se nao tem grant ativo, comeca agora
  if last_ends_at is null then
    last_ends_at := now();
  end if;

  new_starts_at := last_ends_at;
  new_ends_at := last_ends_at + (p_days || ' days')::interval;

  -- Cria o grant empilhado
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
    new_starts_at,
    new_ends_at,
    'bonus-' || gen_random_uuid()::text,
    jsonb_build_object(
      'days', p_days,
      'reason', p_reason,
      'referral_id', p_referral_id,
      'granted_at', now(),
      'stacked_from', last_ends_at
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
  'Cria grant de bonus. EMPILHA ao maior ends_at existente (nao sobrescreve). Apenas service_role.';


-- ============================================================
-- 2. Nova RPC: get_my_product_access_status
--    Considera TODOS os grants (free, referral, bonus, admin, subscription)
-- ============================================================

create or replace function public.get_my_product_access_status()
returns table (
  product text,
  has_access boolean,
  access_until timestamptz,
  days_remaining integer,
  source text,
  has_free_activated boolean,
  can_activate_free boolean
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
  with products(product_name) as (
    values ('personal'::text), ('business'::text)
  ),
  active_grants as (
    select
      g.product,
      g.source,
      g.ends_at,
      g.starts_at,
      g.id,
      g.external_reference
    from public.entitlement_grants g
    join public.entitlement_accounts a
      on a.user_id = g.user_id
    where g.user_id = current_user_id
      and a.status = 'active'
      and g.status = 'active'
      and g.starts_at <= now()
      and (g.ends_at is null or g.ends_at > now())
  ),
  free_grants as (
    select distinct on (g.product)
      g.product,
      g.id,
      g.ends_at
    from public.entitlement_grants g
    where g.user_id = current_user_id
      and g.source = 'free'
      and g.external_reference = 'free-' || g.product || '-v1'
    order by g.product, g.created_at desc
  )
  select
    p.product_name as product,
    coalesce(has_access.cnt, 0) > 0 as has_access,
    has_access.max_ends_at as access_until,
    case
      when has_access.max_ends_at is null and coalesce(has_access.cnt, 0) > 0 then null
      when has_access.max_ends_at is not null then
        greatest(0, ceiling(extract(epoch from (has_access.max_ends_at - now())) / 86400))::integer
      else 0
    end as days_remaining,
    has_access.best_source as source,
    (f.id is not null) as has_free_activated,
    (f.id is null) as can_activate_free
  from products p
  left join lateral (
    select
      count(*)::integer as cnt,
      max(ag.ends_at) as max_ends_at,
      (
        array_agg(ag.source order by
          case ag.source
            when 'subscription' then 1
            when 'admin' then 2
            when 'referral' then 3
            when 'bonus' then 4
            when 'free' then 5
            else 99
          end
        )
      )[1] as best_source
    from active_grants ag
    where ag.product = p.product_name
  ) has_access on true
  left join free_grants f on f.product = p.product_name
  order by case
    when p.product_name = 'personal' then 1
    else 2
  end;
end;
$$;

revoke all on function public.get_my_product_access_status()
  from public, anon;

grant execute on function public.get_my_product_access_status()
  to authenticated;

comment on function public.get_my_product_access_status() is
  'Retorna status consolidado de acesso (todos os grants). Inclui days_remaining e source.';
