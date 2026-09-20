-- ============================================================
-- REFERRAL COMMISSIONS - Comissao financeira por indicacao
-- Regra:
--   - 1 comissao por indicacao paga
--   - Base: valor mensal equivalente do plano pago
--   - % conforme plano do indicador (5/15/25/35)
--   - Influencer: % customizada
--   - Status: PENDING -> AVAILABLE (>= R$ 20) -> PAID
--   - Cancelamento: revoga PENDING e AVAILABLE
-- ============================================================

-- ============================================================
-- 1. TABELA: influencer_profiles (parceiros custom)
-- ============================================================

create table public.influencer_profiles (
  user_id uuid primary key
    references auth.users(id) on delete cascade,

  custom_commission_rate numeric(5,2) not null
    check (custom_commission_rate >= 0 and custom_commission_rate <= 100),

  granted_access_level text not null default 'PAID_FULL'
    check (granted_access_level in ('PAID_FULL')),

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true
);

alter table public.influencer_profiles enable row level security;

revoke all on table public.influencer_profiles
  from public, anon, authenticated;


-- ============================================================
-- 2. TABELA: referral_commissions
-- ============================================================

create table public.referral_commissions (
  id uuid primary key default gen_random_uuid(),

  referral_id uuid not null
    references public.referrals(id) on delete cascade,

  referrer_user_id uuid not null
    references auth.users(id) on delete cascade,

  referred_user_id uuid not null
    references auth.users(id) on delete cascade,

  plan_type text not null
    check (plan_type in ('monthly', 'semiannual', 'annual')),

  referrer_plan_at_event text not null
    check (referrer_plan_at_event in (
      'free', 'monthly', 'semiannual', 'annual', 'influencer'
    )),

  commission_rate_snapshot numeric(5,2) not null
    check (commission_rate_snapshot >= 0 and commission_rate_snapshot <= 100),

  base_amount numeric(12,2) not null
    check (base_amount >= 0),

  monthly_equivalent_amount numeric(12,2) not null
    check (monthly_equivalent_amount >= 0),

  commission_amount numeric(12,2) not null
    check (commission_amount >= 0),

  status text not null default 'pending'
    check (status in ('pending', 'available', 'paid', 'cancelled')),

  available_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,

  cancelled_reason text,
  cancelled_by uuid references auth.users(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 1 comissao por referral (nao duplicar)
  constraint referral_commissions_unique_per_referral
    unique (referral_id)
);

create index referral_commissions_referrer_idx
  on public.referral_commissions (referrer_user_id);

create index referral_commissions_status_idx
  on public.referral_commissions (status);

create index referral_commissions_created_at_idx
  on public.referral_commissions (created_at desc);

alter table public.referral_commissions enable row level security;

revoke all on table public.referral_commissions
  from public, anon, authenticated;


-- ============================================================
-- 3. TRIGGERS: updated_at
-- ============================================================

create trigger set_influencer_profiles_updated_at
before update on public.influencer_profiles
for each row
execute function public.set_entitlement_updated_at();

create trigger set_referral_commissions_updated_at
before update on public.referral_commissions
for each row
execute function public.set_entitlement_updated_at();


-- ============================================================
-- 4. HELPER: % de comissao do indicador
-- ============================================================

create or replace function public.get_referrer_commission_rate(
  p_referrer_user_id uuid
)
returns table (
  rate numeric,
  source text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  influencer_rate numeric;
  plan_rate numeric;
  current_plan text;
begin
  if p_referrer_user_id is null then
    raise exception 'p_referrer_user_id obrigatorio';
  end if;

  -- 1) Verifica se e influencer
  select ip.custom_commission_rate
  into influencer_rate
  from public.influencer_profiles as ip
  where ip.user_id = p_referrer_user_id
    and ip.is_active = true;

  if influencer_rate is not null then
    return query select influencer_rate, 'influencer'::text;
    return;
  end if;

  -- 2) Sem influencer: usa % do plano
  -- Busca plano ativo em subscriptions
  select s.plan
  into current_plan
  from public.subscriptions as s
  where s.user_id = p_referrer_user_id
    and s.status = 'active'
  order by s.created_at desc
  limit 1;

  if current_plan is null then
    -- Sem subscription: free = 5%
    return query select 5.00::numeric, 'free'::text;
    return;
  end if;

  -- Mapeia plano -> %
  case current_plan
    when 'monthly' then plan_rate := 15.00;
    when 'semiannual' then plan_rate := 25.00;
    when 'annual' then plan_rate := 35.00;
    else plan_rate := 5.00;
  end case;

  return query select plan_rate, current_plan;
end;
$$;

revoke all on function public.get_referrer_commission_rate(uuid)
  from public, anon, authenticated;

comment on function public.get_referrer_commission_rate(uuid) is
  'Retorna a % de comissao do indicador. Prioridade: influencer custom > plano > free.';


-- ============================================================
-- 5. HELPER: valor mensal equivalente do plano
-- ============================================================

create or replace function public.get_monthly_equivalent_amount(
  p_plan_type text,
  p_base_amount numeric
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_base_amount is null or p_base_amount < 0 then
    raise exception 'Valor base invalido';
  end if;

  case p_plan_type
    when 'monthly' then
      return p_base_amount;
    when 'semiannual' then
      return round(p_base_amount / 6, 2);
    when 'annual' then
      return round(p_base_amount / 12, 2);
    else
      raise exception 'Tipo de plano invalido: %', p_plan_type;
  end case;
end;
$$;

revoke all on function public.get_monthly_equivalent_amount(text, numeric)
  from public, anon, authenticated;

comment on function public.get_monthly_equivalent_amount(text, numeric) is
  'Retorna o valor mensal equivalente do plano pago.';


-- ============================================================
-- 6. RPC: create_referral_commission (service_role)
-- ============================================================

create or replace function public.create_referral_commission(
  p_referred_user_id uuid,
  p_plan_type text,
  p_base_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  referral_record record;
  rate_record record;
  monthly_equivalent numeric;
  commission numeric;
  new_commission_id uuid;
begin
  if p_referred_user_id is null then
    raise exception 'p_referred_user_id obrigatorio';
  end if;

  if p_plan_type not in ('monthly', 'semiannual', 'annual') then
    raise exception 'Tipo de plano invalido: %', p_plan_type;
  end if;

  if p_base_amount is null or p_base_amount <= 0 then
    raise exception 'Valor base invalido';
  end if;

  -- Busca referral
  select
    r.id as referral_id,
    r.referrer_user_id,
    r.referred_user_id
  into referral_record
  from public.referrals as r
  where r.referred_user_id = p_referred_user_id;

  if referral_record.referral_id is null then
    raise exception 'Usuario % nao foi indicado', p_referred_user_id;
  end if;

  -- Idempotencia: se ja existe comissao pra esse referral, retorna
  select id into new_commission_id
  from public.referral_commissions
  where referral_id = referral_record.referral_id
    and status != 'cancelled'
  limit 1;

  if new_commission_id is not null then
    return new_commission_id;
  end if;

  -- Calcula % do indicador
  select * into rate_record
  from public.get_referrer_commission_rate(referral_record.referrer_user_id);

  -- Valor mensal equivalente
  monthly_equivalent := public.get_monthly_equivalent_amount(p_plan_type, p_base_amount);

  -- Valor final da comissao
  commission := round(monthly_equivalent * rate_record.rate / 100, 2);

  -- Cria registro
  insert into public.referral_commissions (
    referral_id,
    referrer_user_id,
    referred_user_id,
    plan_type,
    referrer_plan_at_event,
    commission_rate_snapshot,
    base_amount,
    monthly_equivalent_amount,
    commission_amount,
    status,
    available_at,
    metadata
  )
  values (
    referral_record.referral_id,
    referral_record.referrer_user_id,
    p_referred_user_id,
    p_plan_type,
    rate_record.source,
    rate_record.rate,
    p_base_amount,
    monthly_equivalent,
    commission,
    'pending',
    null,
    jsonb_build_object(
      'created_via', 'create_referral_commission',
      'computed_at', now()
    )
  )
  returning id into new_commission_id;

  -- Tenta liberar (se saldo >= 20)
  perform public.recompute_commission_availability(referral_record.referrer_user_id);

  return new_commission_id;
end;
$$;

revoke all on function public.create_referral_commission(uuid, text, numeric)
  from public, anon, authenticated;

comment on function public.create_referral_commission(uuid, text, numeric) is
  'Cria comissao para o indicador. Apenas service_role. Idempotente por referral_id.';


-- ============================================================
-- 7. RPC: recompute_commission_availability (interna)
-- ============================================================

create or replace function public.recompute_commission_availability(
  p_referrer_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  available_total numeric;
begin
  if p_referrer_user_id is null then
    return;
  end if;

  -- Soma comissoes pending
  select coalesce(sum(commission_amount), 0)
  into available_total
  from public.referral_commissions
  where referrer_user_id = p_referrer_user_id
    and status = 'pending';

  -- Se >= 20, libera todas as pending
  if available_total >= 20.00 then
    update public.referral_commissions
    set
      status = 'available',
      available_at = now()
    where referrer_user_id = p_referrer_user_id
      and status = 'pending';
  end if;
end;
$$;

revoke all on function public.recompute_commission_availability(uuid)
  from public, anon, authenticated;

comment on function public.recompute_commission_availability(uuid) is
  'Libera comissoes pending quando o saldo total atinge R$ 20.';


-- ============================================================
-- 8. RPC: cancel_referral_commission (service_role)
-- ============================================================

create or replace function public.cancel_referral_commission(
  p_referral_id uuid,
  p_reason text,
  p_cancelled_by uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer := 0;
begin
  if p_referral_id is null then
    raise exception 'p_referral_id obrigatorio';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'p_reason obrigatorio';
  end if;

  update public.referral_commissions
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = p_reason,
    cancelled_by = p_cancelled_by,
    metadata = metadata || jsonb_build_object(
      'cancelled_via', 'cancel_referral_commission'
    )
  where referral_id = p_referral_id
    and status in ('pending', 'available');

  get diagnostics affected = row_count;

  return affected;
end;
$$;

revoke all on function public.cancel_referral_commission(uuid, text, uuid)
  from public, anon, authenticated;

comment on function public.cancel_referral_commission(uuid, text, uuid) is
  'Cancela comissoes de um referral. Apenas service_role. Nao altera comissoes pagas.';


-- ============================================================
-- 9. RPC: list_my_referral_commissions (authenticated)
-- ============================================================

create or replace function public.list_my_referral_commissions()
returns table (
  commission_id uuid,
  referred_user_id uuid,
  plan_type text,
  referrer_plan_at_event text,
  commission_rate numeric,
  base_amount numeric,
  commission_amount numeric,
  status text,
  available_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
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
    rc.id,
    rc.referred_user_id,
    rc.plan_type,
    rc.referrer_plan_at_event,
    rc.commission_rate_snapshot,
    rc.base_amount,
    rc.commission_amount,
    rc.status,
    rc.available_at,
    rc.paid_at,
    rc.cancelled_at,
    rc.created_at
  from public.referral_commissions as rc
  where rc.referrer_user_id = current_user_id
  order by rc.created_at desc;
end;
$$;

revoke all on function public.list_my_referral_commissions()
  from public, anon;

grant execute on function public.list_my_referral_commissions()
  to authenticated;

comment on function public.list_my_referral_commissions() is
  'Lista comissoes do usuario autenticado.';


-- ============================================================
-- 10. RPC: get_my_commission_summary (authenticated)
-- ============================================================

create or replace function public.get_my_commission_summary()
returns table (
  pending_total numeric,
  available_total numeric,
  paid_total numeric,
  cancelled_total numeric,
  can_withdraw boolean,
  minimum_withdrawal numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  min_withdrawal numeric := 20.00;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  select
    coalesce(sum(case when status = 'pending' then commission_amount else 0 end), 0)::numeric,
    coalesce(sum(case when status = 'available' then commission_amount else 0 end), 0)::numeric,
    coalesce(sum(case when status = 'paid' then commission_amount else 0 end), 0)::numeric,
    coalesce(sum(case when status = 'cancelled' then commission_amount else 0 end), 0)::numeric,
    (coalesce(sum(case when status = 'available' then commission_amount else 0 end), 0) >= min_withdrawal),
    min_withdrawal
  from public.referral_commissions
  where referrer_user_id = current_user_id;
end;
$$;

revoke all on function public.get_my_commission_summary()
  from public, anon;

grant execute on function public.get_my_commission_summary()
  to authenticated;

comment on function public.get_my_commission_summary() is
  'Resumo financeiro de comissoes do usuario autenticado.';


-- ============================================================
-- 11. RPC: set_user_as_influencer (service_role)
-- ============================================================

create or replace function public.set_user_as_influencer(
  p_user_id uuid,
  p_custom_rate numeric,
  p_notes text default null,
  p_created_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id obrigatorio';
  end if;

  if p_custom_rate is null
    or p_custom_rate < 0
    or p_custom_rate > 100 then
    raise exception 'Taxa invalida: deve estar entre 0 e 100';
  end if;

  insert into public.influencer_profiles (
    user_id,
    custom_commission_rate,
    notes,
    created_by,
    is_active
  )
  values (
    p_user_id,
    p_custom_rate,
    p_notes,
    p_created_by,
    true
  )
  on conflict (user_id) do update
    set
      custom_commission_rate = excluded.custom_commission_rate,
      notes = excluded.notes,
      is_active = true,
      updated_at = now();
end;
$$;

revoke all on function public.set_user_as_influencer(uuid, numeric, text, uuid)
  from public, anon, authenticated;

comment on function public.set_user_as_influencer(uuid, numeric, text, uuid) is
  'Define usuario como influencer com % customizada. Apenas service_role.';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
