-- ============================================================
-- SUBSCRIPTION PAYMENTS - Log de transacoes Mercado Pago
-- Rastreia cada preapproval/pagamento criado no MP
-- ============================================================

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id) on delete cascade,

  subscription_id uuid
    references public.subscriptions(id) on delete set null,

  mp_preapproval_id text,
  mp_payment_id text,

  plan_type text not null
    check (plan_type in ('monthly', 'semiannual', 'annual')),

  access_level text not null default 'PAID_FULL'
    check (access_level in ('FREE', 'PAID_FULL')),

  amount numeric(12,2) not null
    check (amount >= 0),

  status text not null
    check (status in (
      'pending',
      'approved',
      'authorized',
      'in_process',
      'rejected',
      'cancelled',
      'refunded',
      'charged_back'
    )),

  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production')),

  raw_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_payload) = 'object'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscription_payments_user_id_idx
  on public.subscription_payments (user_id);

create index subscription_payments_mp_preapproval_id_idx
  on public.subscription_payments (mp_preapproval_id)
  where mp_preapproval_id is not null;

create index subscription_payments_mp_payment_id_idx
  on public.subscription_payments (mp_payment_id)
  where mp_payment_id is not null;

create index subscription_payments_status_idx
  on public.subscription_payments (status);

alter table public.subscription_payments enable row level security;

revoke all on table public.subscription_payments
  from public, anon, authenticated;

create trigger set_subscription_payments_updated_at
before update on public.subscription_payments
for each row
execute function public.set_entitlement_updated_at();

comment on table public.subscription_payments is
  'Log de transacoes Mercado Pago (preapproval + payments).';
