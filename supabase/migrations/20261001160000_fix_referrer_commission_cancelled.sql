-- ============================================================
-- FIX: get_referrer_commission_rate
-- Considera active OU cancelled (dentro do periodo pago)
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

  -- 1) Influencer tem prioridade
  select ip.custom_commission_rate
  into influencer_rate
  from public.influencer_profiles as ip
  where ip.user_id = p_referrer_user_id
    and ip.is_active = true;

  if influencer_rate is not null then
    return query select influencer_rate, 'influencer'::text;
    return;
  end if;

  -- 2) Busca plano vigente (active OU cancelled com periodo ainda valido)
  select s.plan
  into current_plan
  from public.subscriptions as s
  where s.user_id = p_referrer_user_id
    and (
      s.status = 'active'
      or (
        s.status = 'cancelled'
        and s.current_period_end is not null
        and s.current_period_end > now()
      )
    )
  order by s.created_at desc
  limit 1;

  -- 3) Sem plano vigente: free 5%
  if current_plan is null then
    return query select 5.00::numeric, 'free'::text;
    return;
  end if;

  -- 4) Mapeia plano -> %
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
  'Retorna a % de comissao. Considera active OU cancelled vigente (mantem % ate fim do periodo pago).';
