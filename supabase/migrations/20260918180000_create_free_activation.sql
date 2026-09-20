-- ============================================================
-- FREE ACTIVATION - Ativacao dos 7 dias gratuitos
-- Usuario free escolhe ativar Personal, Business ou ambos
-- Timers independentes por produto
-- ============================================================

-- ============================================================
-- 1. RPC: activate_free_product
-- ============================================================

create or replace function public.activate_free_product(
  p_product text
)
returns table (
  grant_id uuid,
  product text,
  starts_at timestamptz,
  ends_at timestamptz,
  already_activated boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_grant_id uuid;
  existing_starts_at timestamptz;
  existing_ends_at timestamptz;
  new_grant_id uuid;
  new_starts_at timestamptz;
  new_ends_at timestamptz;
  free_days integer := 7;
  external_ref text;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_product not in ('personal', 'business') then
    raise exception 'Produto invalido: %', p_product;
  end if;

  -- Verifica se conta de entitlement existe
  if not exists (
    select 1 from public.entitlement_accounts
    where user_id = current_user_id
  ) then
    raise exception 'Conta de entitlement nao encontrada';
  end if;

  -- Procura grant FREE existente para o produto
  -- (mesmo que expirado, para nao dar free 2x)
  select
    g.id,
    g.starts_at,
    g.ends_at
  into
    existing_grant_id,
    existing_starts_at,
    existing_ends_at
  from public.entitlement_grants as g
  where g.user_id = current_user_id
    and g.product = p_product
    and g.source = 'free'
    and g.external_reference = 'free-' || p_product || '-v1'
  order by g.created_at desc
  limit 1;

  -- Se ja existe, retorna o existente
  if existing_grant_id is not null then
    return query select
      existing_grant_id,
      p_product,
      existing_starts_at,
      existing_ends_at,
      true;
    return;
  end if;

  -- Monta referencia unica do grant free
  external_ref := 'free-' || p_product || '-v1';

  -- Cria o grant
  new_starts_at := now();
  new_ends_at := now() + (free_days || ' days')::interval;

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
    current_user_id,
    p_product,
    'free',
    'active',
    new_starts_at,
    new_ends_at,
    external_ref,
    jsonb_build_object(
      'days', free_days,
      'reason', 'free-activation',
      'activated_at', now()
    )
  )
  returning id into new_grant_id;

  return query select
    new_grant_id,
    p_product,
    new_starts_at,
    new_ends_at,
    false;
end;
$$;

revoke all on function public.activate_free_product(text)
  from public, anon;

grant execute on function public.activate_free_product(text)
  to authenticated;

comment on function public.activate_free_product(text) is
  'Ativa o periodo free de 7 dias para o produto escolhido. Idempotente por usuario+produto.';


-- ============================================================
-- 2. RPC: get_my_free_activation_status
-- ============================================================

create or replace function public.get_my_free_activation_status()
returns table (
  product text,
  activated boolean,
  activation_starts_at timestamptz,
  activation_ends_at timestamptz,
  is_currently_active boolean,
  can_activate boolean
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
  )
  select
    products.product_name,
    (free_grant.id is not null),
    free_grant.starts_at,
    free_grant.ends_at,
    (
      free_grant.id is not null
      and free_grant.status = 'active'
      and free_grant.starts_at <= now()
      and (free_grant.ends_at is null or free_grant.ends_at > now())
    ),
    (free_grant.id is null)
  from products
  left join lateral (
    select
      g.id,
      g.status,
      g.starts_at,
      g.ends_at
    from public.entitlement_grants as g
    where g.user_id = current_user_id
      and g.product = products.product_name
      and g.source = 'free'
      and g.external_reference = 'free-' || products.product_name || '-v1'
    order by g.created_at desc
    limit 1
  ) as free_grant on true
  order by case
    when products.product_name = 'personal' then 1
    else 2
  end;
end;
$$;

revoke all on function public.get_my_free_activation_status()
  from public, anon;

grant execute on function public.get_my_free_activation_status()
  to authenticated;

comment on function public.get_my_free_activation_status() is
  'Retorna o status de ativacao free (personal/business) do usuario autenticado.';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
