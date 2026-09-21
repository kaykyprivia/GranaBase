-- ============================================================
-- WEBHOOK EVENTS - Idempotencia de webhooks Mercado Pago
-- Garante que cada evento e processado apenas 1 vez
-- ============================================================

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),

  provider text not null default 'mercadopago'
    check (provider in ('mercadopago')),

  event_id text not null,
  event_type text not null,
  action text,

  resource_id text,

  payload jsonb not null
    check (jsonb_typeof(payload) = 'object'),

  processed boolean not null default false,
  processed_at timestamptz,
  error_message text,

  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production')),

  created_at timestamptz not null default now(),

  constraint webhook_events_unique_per_provider
    unique (provider, event_id)
);

create index webhook_events_event_type_idx
  on public.webhook_events (event_type);

create index webhook_events_resource_id_idx
  on public.webhook_events (resource_id)
  where resource_id is not null;

create index webhook_events_processed_idx
  on public.webhook_events (processed)
  where processed = false;

create index webhook_events_created_at_idx
  on public.webhook_events (created_at desc);

alter table public.webhook_events enable row level security;

revoke all on table public.webhook_events
  from public, anon, authenticated;

comment on table public.webhook_events is
  'Log idempotente de webhooks recebidos do Mercado Pago.';
