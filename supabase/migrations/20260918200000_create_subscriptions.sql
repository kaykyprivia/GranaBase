-- ============================================================
-- SUBSCRIPTIONS - Assinaturas dos planos pagos
-- Planos: monthly, semiannual, annual
-- Access level: FREE ou PAID_FULL
-- 1 subscription ativa por usuario
-- ============================================================

-- ============================================================
-- 1. TABELA: subscriptions
-- ============================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,

  plan text not null
    check (plan in ('monthly', 'semiannual', 'annual')),

  access_level text not null default 'PAID_FULL'
    check (access_level in ('FREE', 'PAID_FULL')),

  status text not null default 'pending'
    check (status in (
      'pending',
      'active',
      'cancelled',
      'expired',
      'past_due'
    )),

  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,

  provider text not null default 'manual'
    check (provider in ('mercadopago', 'manual', 'free')),

  provider_subscription_id text,

  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_valid_period
    check (
      current_period_end is null
      or current_period_start is null
      or current_period_end > current_period_start
    )
);

-- Busca por usuario
create index subscriptions_user_id_idx
  on public.subscriptions (user_id);

-- Busca por provider_subscription_id (webhook do Mercado Pago)
create index subscriptions_provider_sub_id_idx
  on public.subscriptions (provider_subscription_id)
  where provider_subscription_id is not null;

-- So 1 subscription ativa por usuario
create unique index subscriptions_one_active_per_user_uidx
  on public.subscriptions (user_id)
  where status = 'active';

alter table public.subscriptions enable row level security;

revoke all on table public.subscriptions
  from public, anon, authenticated;


-- ============================================================
-- 2. TABELA: subscription_events (auditoria)
-- ============================================================

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),

  subscription_id uuid not null
    references public.subscriptions(id) on delete cascade,

  user_id uuid not null
    references auth.users(id) on delete cascade,

  event_type text not null
    check (event_type in (
      'created',
      'activated',
      'renewed',
      'upgraded',
      'downgraded',
      'cancelled',
      'expired',
      'payment_succeeded',
      'payment_failed',
      'reactivated'
    )),

  old_status text,
  new_status text,

  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),

  created_at timestamptz not null default now()
);

create index subscription_events_subscription_id_idx
  on public.subscription_events (subscription_id);

create index subscription_events_user_id_idx
  on public.subscription_events (user_id);

create index subscription_events_created_at_idx
  on public.subscription_events (created_at desc);

alter table public.subscription_events enable row level security;

revoke all on table public.subscription_events
  from public, anon, authenticated;


-- ============================================================
-- 3. TRIGGER: updated_at em subscriptions
-- ============================================================

create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_entitlement_updated_at();


-- ============================================================
-- 4. RPC: get_my_subscription (authenticated)
-- ============================================================

create or replace function public.get_my_subscription()
returns table (
  subscription_id uuid,
  plan text,
  access_level text,
  status text,
  started_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  provider text,
  days_remaining integer
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
    s.id,
    s.plan,
    s.access_level,
    s.status,
    s.started_at,
    s.current_period_start,
    s.current_period_end,
    s.cancelled_at,
    s.provider,
    case
      when s.current_period_end is null then null
      else greatest(
        0,
        ceil(extract(epoch from (s.current_period_end - now())) / 86400)
      )::integer
    end
  from public.subscriptions as s
  where s.user_id = current_user_id
    and s.status in ('active', 'past_due')
  order by s.created_at desc
  limit 1;
end;
$$;

revoke all on function public.get_my_subscription()
  from public, anon;

grant execute on function public.get_my_subscription()
  to authenticated;

comment on function public.get_my_subscription() is
  'Retorna a subscription ativa/past_due do usuario autenticado.';


-- ============================================================
-- 5. RPC: has_active_subscription (authenticated)
-- ============================================================

create or replace function public.has_active_subscription()
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
    from public.subscriptions as s
    where s.user_id = current_user_id
      and s.status = 'active'
      and s.access_level = 'PAID_FULL'
      and (s.current_period_end is null or s.current_period_end > now())
  );
end;
$$;

revoke all on function public.has_active_subscription()
  from public, anon;

grant execute on function public.has_active_subscription()
  to authenticated;

comment on function public.has_active_subscription() is
  'Retorna true se o usuario autenticado possui subscription paga ativa.';


-- ============================================================
-- 6. RPC: list_my_subscription_events (authenticated)
-- ============================================================

create or replace function public.list_my_subscription_events()
returns table (
  event_id uuid,
  event_type text,
  old_status text,
  new_status text,
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
    e.id,
    e.event_type,
    e.old_status,
    e.new_status,
    e.created_at
  from public.subscription_events as e
  where e.user_id = current_user_id
  order by e.created_at desc
  limit 50;
end;
$$;

revoke all on function public.list_my_subscription_events()
  from public, anon;

grant execute on function public.list_my_subscription_events()
  to authenticated;

comment on function public.list_my_subscription_events() is
  'Lista os ultimos 50 eventos de subscription do usuario autenticado.';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
