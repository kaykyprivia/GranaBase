-- ============================================================
-- MERCADO PAGO RPCs - Integracao backend <-> banco
-- 4 RPCs: criar registro, atualizar status, idempotencia webhook, historico
-- ============================================================

-- ============================================================
-- 1. RPC: create_mp_subscription_record (service_role)
-- ============================================================

create or replace function public.create_mp_subscription_record(
  p_user_id uuid,
  p_plan_type text,
  p_amount numeric,
  p_mp_preapproval_id text,
  p_environment text default 'sandbox'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_payment_id uuid;
begin
  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_plan_type not in ('monthly', 'semiannual', 'annual') then
    raise exception 'Tipo de plano invalido: %', p_plan_type;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor invalido';
  end if;

  if p_environment not in ('sandbox', 'production') then
    raise exception 'Ambiente invalido: %', p_environment;
  end if;

  insert into public.subscription_payments (
    user_id,
    plan_type,
    amount,
    status,
    mp_preapproval_id,
    environment,
    raw_payload
  )
  values (
    p_user_id,
    p_plan_type,
    p_amount,
    'pending',
    p_mp_preapproval_id,
    p_environment,
    jsonb_build_object(
      'created_via', 'create_mp_subscription_record',
      'created_at', now()
    )
  )
  returning id into new_payment_id;

  return new_payment_id;
end;
$$;

revoke all on function public.create_mp_subscription_record(uuid, text, numeric, text, text)
  from public, anon, authenticated;

comment on function public.create_mp_subscription_record(uuid, text, numeric, text, text) is
  'Registra tentativa de assinatura MP. Apenas service_role.';


-- ============================================================
-- 2. RPC: update_mp_payment_status (service_role)
-- ============================================================

create or replace function public.update_mp_payment_status(
  p_mp_preapproval_id text,
  p_status text,
  p_mp_payment_id text default null,
  p_raw_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record record;
  new_subscription_id uuid;
  updated_id uuid;
begin
  if p_mp_preapproval_id is null or length(trim(p_mp_preapproval_id)) = 0 then
    raise exception 'p_mp_preapproval_id obrigatorio';
  end if;

  if p_status not in (
    'pending', 'approved', 'authorized', 'in_process',
    'rejected', 'cancelled', 'refunded', 'charged_back'
  ) then
    raise exception 'Status invalido: %', p_status;
  end if;

  -- Busca o registro
  select
    sp.id,
    sp.user_id,
    sp.subscription_id,
    sp.plan_type,
    sp.environment
  into payment_record
  from public.subscription_payments as sp
  where sp.mp_preapproval_id = p_mp_preapproval_id
  order by sp.created_at desc
  limit 1;

  if payment_record.id is null then
    raise exception 'Preapproval nao encontrado: %', p_mp_preapproval_id;
  end if;

  -- Se status = approved: cria subscription se nao existir
  if p_status = 'approved' and payment_record.subscription_id is null then
    insert into public.subscriptions (
      user_id,
      plan,
      access_level,
      status,
      started_at,
      current_period_start,
      current_period_end,
      provider,
      provider_subscription_id,
      metadata
    )
    values (
      payment_record.user_id,
      payment_record.plan_type,
      'PAID_FULL',
      'active',
      now(),
      now(),
      case payment_record.plan_type
        when 'monthly' then now() + interval '1 month'
        when 'semiannual' then now() + interval '6 months'
        when 'annual' then now() + interval '12 months'
      end,
      'mercadopago',
      p_mp_preapproval_id,
      jsonb_build_object(
        'created_via', 'mp_webhook',
        'environment', payment_record.environment
      )
    )
    returning id into new_subscription_id;
  else
    new_subscription_id := payment_record.subscription_id;

    -- Se status = cancelled/refunded/charged_back: cancela subscription
    if p_status in ('cancelled', 'refunded', 'charged_back')
       and payment_record.subscription_id is not null then
      update public.subscriptions
      set
        status = 'cancelled',
        cancelled_at = now()
      where id = payment_record.subscription_id
        and status = 'active';
    end if;
  end if;

  -- Atualiza o registro
  update public.subscription_payments
  set
    status = p_status,
    mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
    subscription_id = new_subscription_id,
    raw_payload = raw_payload || coalesce(p_raw_payload, '{}'::jsonb)
  where id = payment_record.id
  returning id into updated_id;

  return updated_id;
end;
$$;

revoke all on function public.update_mp_payment_status(text, text, text, jsonb)
  from public, anon, authenticated;

comment on function public.update_mp_payment_status(text, text, text, jsonb) is
  'Atualiza status do pagamento MP + cria subscription se approved. Apenas service_role.';


-- ============================================================
-- 3. RPC: process_webhook_event (service_role, idempotente)
-- ============================================================

create or replace function public.process_webhook_event(
  p_event_id text,
  p_event_type text,
  p_resource_id text default null,
  p_action text default null,
  p_payload jsonb default '{}'::jsonb,
  p_environment text default 'sandbox'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_id uuid;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'p_event_id obrigatorio';
  end if;

  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'p_event_type obrigatorio';
  end if;

  if p_environment not in ('sandbox', 'production') then
    raise exception 'Ambiente invalido: %', p_environment;
  end if;

  -- Tenta inserir. Se ja existe (mesmo event_id), retorna false
  insert into public.webhook_events (
    provider,
    event_id,
    event_type,
    resource_id,
    action,
    payload,
    environment
  )
  values (
    'mercadopago',
    p_event_id,
    p_event_type,
    p_resource_id,
    p_action,
    coalesce(p_payload, '{}'::jsonb),
    p_environment
  )
  on conflict (provider, event_id) do nothing
  returning id into inserted_id;

  -- Se inserted_id for null, ja existia
  if inserted_id is null then
    return false;
  end if;

  -- Marca como processado
  update public.webhook_events
  set
    processed = true,
    processed_at = now()
  where id = inserted_id;

  return true;
end;
$$;

revoke all on function public.process_webhook_event(text, text, text, text, jsonb, text)
  from public, anon, authenticated;

comment on function public.process_webhook_event(text, text, text, text, jsonb, text) is
  'Registra webhook MP de forma idempotente. Retorna true se for novo, false se duplicado.';


-- ============================================================
-- 4. RPC: list_my_subscription_payments (authenticated)
-- ============================================================

create or replace function public.list_my_subscription_payments()
returns table (
  payment_id uuid,
  plan_type text,
  amount numeric,
  status text,
  mp_preapproval_id text,
  mp_payment_id text,
  environment text,
  created_at timestamptz,
  updated_at timestamptz
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
    sp.id,
    sp.plan_type,
    sp.amount,
    sp.status,
    sp.mp_preapproval_id,
    sp.mp_payment_id,
    sp.environment,
    sp.created_at,
    sp.updated_at
  from public.subscription_payments as sp
  where sp.user_id = current_user_id
  order by sp.created_at desc
  limit 50;
end;
$$;

revoke all on function public.list_my_subscription_payments()
  from public, anon;

grant execute on function public.list_my_subscription_payments()
  to authenticated;

comment on function public.list_my_subscription_payments() is
  'Historico de pagamentos MP do usuario autenticado.';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
