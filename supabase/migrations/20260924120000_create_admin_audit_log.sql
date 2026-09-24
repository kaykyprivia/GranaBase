-- ============================================================
-- ADMIN AUDIT LOG
-- ============================================================

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log(created_at desc);

create index if not exists idx_admin_audit_log_admin
  on public.admin_audit_log(admin_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "super admins can read admin_audit_log" on public.admin_audit_log;
create policy "super admins can read admin_audit_log"
  on public.admin_audit_log for select
  using (public.is_super_admin());

-- ============================================================
-- HELPER: admin_log_action
-- ============================================================

create or replace function public.admin_log_action(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    return;
  end if;

  insert into public.admin_audit_log (
    admin_user_id, action, target_type, target_id, metadata
  ) values (
    current_user_id, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.admin_log_action(text, text, uuid, jsonb)
  from public, anon, authenticated;

-- ============================================================
-- RPC: admin_list_audit_log
-- ============================================================

create or replace function public.admin_list_audit_log(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  admin_user_id uuid,
  admin_email text,
  action text,
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz
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

  if p_limit is null or p_limit < 1 or p_limit > 500 then
    p_limit := 100;
  end if;

  if p_offset is null or p_offset < 0 then
    p_offset := 0;
  end if;

  return query
  select
    l.id,
    l.admin_user_id,
    u.email::text,
    l.action,
    l.target_type,
    l.target_id,
    l.metadata,
    l.created_at
  from public.admin_audit_log l
  left join auth.users u on u.id = l.admin_user_id
  order by l.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.admin_list_audit_log(integer, integer)
  from public, anon;

grant execute on function public.admin_list_audit_log(integer, integer)
  to authenticated;

comment on function public.admin_list_audit_log(integer, integer) is
  'Lista acoes administrativas registradas. service_role ou SUPER_ADMIN.';

-- ============================================================
-- REESCRITA: admin_update_withdrawal_status (com log)
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

  perform public.admin_log_action(
    'withdrawal_status_updated',
    'withdrawal_request',
    p_request_id,
    jsonb_build_object(
      'previous_status', target_request.status,
      'new_status', p_new_status,
      'admin_notes', p_admin_notes,
      'payment_reference', p_payment_reference
    )
  );
end;
$$;

revoke all on function public.admin_update_withdrawal_status(uuid, text, text, text)
  from public, anon;

grant execute on function public.admin_update_withdrawal_status(uuid, text, text, text)
  to authenticated;

-- ============================================================
-- REESCRITA: admin_grant_bonus_days (com log)
-- ============================================================

create or replace function public.admin_grant_bonus_days(
  p_user_id uuid,
  p_product text,
  p_days integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_grant_id uuid;
begin
  if current_user_id is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  new_grant_id := public.create_bonus_grant(
    p_user_id := p_user_id,
    p_product := p_product,
    p_days := p_days,
    p_source := 'admin',
    p_reason := p_reason,
    p_created_by := current_user_id,
    p_referral_id := null,
    p_metadata := '{"granted_via":"admin_grant_bonus_days"}'::jsonb
  );

  perform public.admin_log_action(
    'bonus_days_granted',
    'user',
    p_user_id,
    jsonb_build_object(
      'product', p_product,
      'days', p_days,
      'reason', p_reason,
      'grant_id', new_grant_id
    )
  );

  return new_grant_id;
end;
$$;

revoke all on function public.admin_grant_bonus_days(uuid, text, integer, text)
  from public, anon;

grant execute on function public.admin_grant_bonus_days(uuid, text, integer, text)
  to authenticated;

-- ============================================================
-- REESCRITA: revoke_bonus_grant (com log)
-- ============================================================

create or replace function public.revoke_bonus_grant(
  p_grant_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_grant record;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is not null and not public.is_super_admin() then
    raise exception 'Acesso negado: requer SUPER_ADMIN';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'p_reason obrigatorio';
  end if;

  select id, status, source, user_id, product
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
    revoked_by = current_user_id,
    metadata = metadata || jsonb_build_object(
      'revoked_reason', p_reason,
      'revoked_via', 'revoke_bonus_grant'
    )
  where id = p_grant_id;

  perform public.admin_log_action(
    'bonus_grant_revoked',
    'user',
    target_grant.user_id,
    jsonb_build_object(
      'grant_id', p_grant_id,
      'product', target_grant.product,
      'reason', p_reason
    )
  );
end;
$$;

revoke all on function public.revoke_bonus_grant(uuid, text)
  from public, anon;

grant execute on function public.revoke_bonus_grant(uuid, text)
  to authenticated;
