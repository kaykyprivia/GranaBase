-- ============================================================
-- ENHANCE list_my_referrals
-- Adiciona: nome parcial, status de plano, comissao, conversao
-- ============================================================

drop function if exists public.list_my_referrals() cascade;

create or replace function public.list_my_referrals()
returns table (
  referral_id uuid,
  referred_user_id uuid,
  referred_display_name text,
  referral_code text,
  attributed_at timestamptz,
  has_active_subscription boolean,
  active_plan_type text,
  converted_at timestamptz,
  commission_earned numeric
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
    r.id,
    r.referred_user_id,
    case
      when u.email is null then 'Indicado'
      when position('@' in u.email) > 1 then
        substring(u.email, 1, 1) || '***' || substring(u.email, position('@' in u.email))
      else 'Indicado'
    end,
    r.referral_code,
    r.attributed_at,
    exists (
      select 1 from public.subscriptions s
      where s.user_id = r.referred_user_id
        and s.status = 'active'
        and s.access_level = 'PAID_FULL'
        and (s.current_period_end is null or s.current_period_end > now())
    ),
    (
      select s.plan from public.subscriptions s
      where s.user_id = r.referred_user_id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
      order by s.created_at desc
      limit 1
    ),
    (
      select max(rc.created_at) from public.referral_commissions rc
      where rc.referral_id = r.id
        and rc.status != 'cancelled'
    ),
    coalesce((
      select sum(rc.commission_amount) from public.referral_commissions rc
      where rc.referral_id = r.id
        and rc.status != 'cancelled'
    ), 0)
  from public.referrals as r
  left join auth.users as u on u.id = r.referred_user_id
  where r.referrer_user_id = current_user_id
  order by r.attributed_at desc;
end;
$$;

revoke all on function public.list_my_referrals()
  from public, anon;

grant execute on function public.list_my_referrals()
  to authenticated;
