-- ============================================================
-- FIX: get_my_withdrawal_summary inclui pending_total
-- Precisa DROP porque o tipo de retorno mudou
-- ============================================================

drop function if exists public.get_my_withdrawal_summary();

create or replace function public.get_my_withdrawal_summary()
returns table (
  available_total numeric,
  pending_total numeric,
  reserved_total numeric,
  paid_total numeric,
  can_withdraw boolean,
  minimum_withdrawal numeric,
  has_pending_request boolean,
  progress_amount numeric
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
  v_pending numeric;
  v_reserved numeric;
  v_paid numeric;
  v_has_pending boolean;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  -- Disponivel (comissoes available, sem withdrawal vinculado)
  select coalesce(sum(commission_amount), 0)
  into v_available
  from public.referral_commissions
  where referrer_user_id = current_user_id
    and status = 'available'
    and withdrawal_request_id is null;

  -- Pendente (comissoes pending que ainda nao atingiram minimo)
  select coalesce(sum(commission_amount), 0)
  into v_pending
  from public.referral_commissions
  where referrer_user_id = current_user_id
    and status = 'pending';

  -- Reservado (available vinculado a saque em andamento)
  select coalesce(sum(commission_amount), 0)
  into v_reserved
  from public.referral_commissions
  where referrer_user_id = current_user_id
    and status = 'available'
    and withdrawal_request_id is not null;

  -- Pago
  select coalesce(sum(commission_amount), 0)
  into v_paid
  from public.referral_commissions
  where referrer_user_id = current_user_id
    and status = 'paid';

  -- Tem solicitacao em andamento?
  select exists (
    select 1 from public.withdrawal_requests
    where user_id = current_user_id
      and status in ('pending', 'processing')
  ) into v_has_pending;

  return query select
    v_available,
    v_pending,
    v_reserved,
    v_paid,
    (v_available >= min_withdrawal and not v_has_pending),
    min_withdrawal,
    v_has_pending,
    (v_available + v_pending) as progress_amount;
end;
$$;

revoke all on function public.get_my_withdrawal_summary()
  from public, anon;

grant execute on function public.get_my_withdrawal_summary()
  to authenticated;

comment on function public.get_my_withdrawal_summary() is
  'Resumo de saques: disponivel, pendente, reservado, pago + progresso.';
