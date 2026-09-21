-- ============================================================
-- WITHDRAWAL REQUESTS - Saques de comissao via Pix
-- Fluxo: pending -> processing -> paid (ou cancelled)
-- Pagamento MANUAL pelo admin
-- ============================================================

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 20),
  pix_key text not null check (length(trim(pix_key)) > 0),
  pix_key_type text not null
    check (pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'cancelled')),
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  admin_notes text,
  admin_id uuid references auth.users(id) on delete set null,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index withdrawal_requests_user_id_idx
  on public.withdrawal_requests (user_id);

create index withdrawal_requests_status_idx
  on public.withdrawal_requests (status);

create unique index withdrawal_requests_one_active_per_user_uidx
  on public.withdrawal_requests (user_id)
  where status in ('pending', 'processing');

alter table public.withdrawal_requests enable row level security;

revoke all on table public.withdrawal_requests
  from public, anon, authenticated;

alter table public.referral_commissions
  add column withdrawal_request_id uuid
    references public.withdrawal_requests(id) on delete set null;

create index referral_commissions_withdrawal_request_id_idx
  on public.referral_commissions (withdrawal_request_id)
  where withdrawal_request_id is not null;

create trigger set_withdrawal_requests_updated_at
before update on public.withdrawal_requests
for each row
execute function public.set_entitlement_updated_at();

-- ============================================================
-- RPC: get_my_withdrawal_summary (authenticated)
-- ============================================================

create or replace function public.get_my_withdrawal_summary()
returns table (
  available_total numeric,
  reserved_total numeric,
  paid_total numeric,
  can_withdraw boolean,
  minimum_withdrawal numeric,
  has_pending_request boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  min_withdrawal numeric := 20.00;
  v_available numeric;
  v_reserved numeric;
  v_paid numeric;
  v_has_pending boolean;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select coalesce(sum(commission_amount), 0)
  into v_available
  from public.referral_commissions
  where referrer_user_id = current_user_id
    and status = 'available'
    and withdrawal_request_id is null;

  select coalesce(sum(commission_amount), 0)
  into v_reserved
  from public.referral_commissions
  where referrer_user_id = current_user_id
    and status = 'available'
    and withdrawal_request_id is not null;

  select coalesce(sum(commission_amount), 0)
  into v_paid
  from public.referral_commissions
  where referrer_user_id = current_user_id
    and status = 'paid';

  select exists (
    select 1 from public.withdrawal_requests
    where user_id = current_user_id
      and status in ('pending', 'processing')
  ) into v_has_pending;

  return query select
    v_available,
    v_reserved,
    v_paid,
    (v_available >= min_withdrawal and not v_has_pending),
    min_withdrawal,
    v_has_pending;
end;
$$;

revoke all on function public.get_my_withdrawal_summary()
  from public, anon;

grant execute on function public.get_my_withdrawal_summary()
  to authenticated;


-- ============================================================
-- RPC: create_my_withdrawal_request (authenticated)
-- ============================================================

create or replace function public.create_my_withdrawal_request(
  p_pix_key text,
  p_pix_key_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  min_withdrawal numeric := 20.00;
  v_available numeric;
  v_has_pending boolean;
  new_request_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_pix_key is null or length(trim(p_pix_key)) = 0 then
    raise exception 'p_pix_key obrigatorio';
  end if;

  if p_pix_key_type not in ('cpf', 'cnpj', 'email', 'phone', 'random') then
    raise exception 'Tipo de chave Pix invalido: %', p_pix_key_type;
  end if;

  select exists (
    select 1 from public.withdrawal_requests
    where user_id = current_user_id
      and status in ('pending', 'processing')
  ) into v_has_pending;

  if v_has_pending then
    raise exception 'Voce ja tem uma solicitacao de saque em andamento';
  end if;

  select coalesce(sum(commission_amount), 0)
  into v_available
  from public.referral_commissions
  where referrer_user_id = current_user_id
    and status = 'available'
    and withdrawal_request_id is null;

  if v_available < min_withdrawal then
    raise exception 'Saldo insuficiente. Minimo: R$ %, disponivel: R$ %',
      min_withdrawal, v_available;
  end if;

  insert into public.withdrawal_requests (
    user_id, amount, pix_key, pix_key_type, status
  )
  values (
    current_user_id, v_available, trim(p_pix_key), p_pix_key_type, 'pending'
  )
  returning id into new_request_id;

  update public.referral_commissions
  set withdrawal_request_id = new_request_id
  where referrer_user_id = current_user_id
    and status = 'available'
    and withdrawal_request_id is null;

  return new_request_id;
end;
$$;

revoke all on function public.create_my_withdrawal_request(text, text)
  from public, anon;

grant execute on function public.create_my_withdrawal_request(text, text)
  to authenticated;


-- ============================================================
-- RPC: list_my_withdrawal_requests (authenticated)
-- ============================================================

create or replace function public.list_my_withdrawal_requests()
returns table (
  request_id uuid,
  amount numeric,
  pix_key text,
  pix_key_type text,
  status text,
  requested_at timestamptz,
  processing_started_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  admin_notes text,
  payment_reference text
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
    wr.id, wr.amount, wr.pix_key, wr.pix_key_type, wr.status,
    wr.requested_at, wr.processing_started_at, wr.paid_at,
    wr.cancelled_at, wr.cancelled_reason, wr.admin_notes, wr.payment_reference
  from public.withdrawal_requests as wr
  where wr.user_id = current_user_id
  order by wr.requested_at desc;
end;
$$;

revoke all on function public.list_my_withdrawal_requests()
  from public, anon;

grant execute on function public.list_my_withdrawal_requests()
  to authenticated;

-- ============================================================
-- RPC: admin_list_withdrawal_requests (service_role ou super_admin)
-- ============================================================

create or replace function public.admin_list_withdrawal_requests(
  p_status text default null
)
returns table (
  request_id uuid,
  user_id uuid,
  user_email text,
  amount numeric,
  pix_key text,
  pix_key_type text,
  status text,
  requested_at timestamptz,
  processing_started_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  admin_notes text,
  payment_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  return query
  select
    wr.id, wr.user_id, u.email::text, wr.amount,
    wr.pix_key, wr.pix_key_type, wr.status,
    wr.requested_at, wr.processing_started_at, wr.paid_at,
    wr.cancelled_at, wr.admin_notes, wr.payment_reference
  from public.withdrawal_requests as wr
  join auth.users as u on u.id = wr.user_id
  where p_status is null or wr.status = p_status
  order by wr.requested_at desc;
end;
$$;

revoke all on function public.admin_list_withdrawal_requests(text)
  from public, anon;

grant execute on function public.admin_list_withdrawal_requests(text)
  to authenticated;


-- ============================================================
-- RPC: admin_update_withdrawal_status (service_role ou super_admin)
-- ============================================================

create or replace function public.admin_update_withdrawal_status(
  p_request_id uuid,
  p_new_status text,
  p_admin_notes text default null,
  p_payment_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_request record;
begin
  if current_user_id is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_request_id is null then
    raise exception 'p_request_id obrigatorio';
  end if;

  if p_new_status not in ('processing', 'paid', 'cancelled') then
    raise exception 'Status invalido: %', p_new_status;
  end if;

  select id, user_id, status
  into target_request
  from public.withdrawal_requests
  where id = p_request_id
  for update;

  if target_request.id is null then
    raise exception 'Solicitacao nao encontrada: %', p_request_id;
  end if;

  if target_request.status = 'paid' then
    raise exception 'Solicitacao ja foi paga';
  end if;

  if target_request.status = 'cancelled' then
    raise exception 'Solicitacao ja foi cancelada';
  end if;

  if p_new_status = 'processing' and target_request.status != 'pending' then
    raise exception 'Nao pode ir de % para processing', target_request.status;
  end if;

  if p_new_status = 'paid' and target_request.status not in ('pending', 'processing') then
    raise exception 'Nao pode ir de % para paid', target_request.status;
  end if;

  update public.withdrawal_requests
  set
    status = p_new_status,
    processing_started_at = case
      when p_new_status = 'processing' and processing_started_at is null then now()
      else processing_started_at
    end,
    paid_at = case when p_new_status = 'paid' then now() else paid_at end,
    cancelled_at = case when p_new_status = 'cancelled' then now() else cancelled_at end,
    cancelled_reason = case when p_new_status = 'cancelled' then p_admin_notes else cancelled_reason end,
    admin_notes = coalesce(p_admin_notes, admin_notes),
    payment_reference = coalesce(p_payment_reference, payment_reference),
    admin_id = current_user_id
  where id = p_request_id;

  if p_new_status = 'paid' then
    update public.referral_commissions
    set status = 'paid', paid_at = now()
    where withdrawal_request_id = p_request_id
      and status = 'available';
  end if;

  if p_new_status = 'cancelled' then
    update public.referral_commissions
    set withdrawal_request_id = null
    where withdrawal_request_id = p_request_id
      and status = 'available';
  end if;
end;
$$;

revoke all on function public.admin_update_withdrawal_status(uuid, text, text, text)
  from public, anon;

grant execute on function public.admin_update_withdrawal_status(uuid, text, text, text)
  to authenticated;
