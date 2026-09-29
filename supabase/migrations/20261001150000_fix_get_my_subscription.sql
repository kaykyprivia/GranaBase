-- ============================================================
-- FIX: get_my_subscription retorna cancelled + provider_subscription_id
-- Precisa DROP porque o tipo de retorno mudou
-- ============================================================

drop function if exists public.get_my_subscription();

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
  provider_subscription_id text,
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
    s.provider_subscription_id,
    case
      when s.current_period_end is null then null
      else greatest(
        0,
        ceil(extract(epoch from (s.current_period_end - now())) / 86400)
      )::integer
    end
  from public.subscriptions as s
  where s.user_id = current_user_id
    and s.status in ('active', 'past_due', 'cancelled')
  order by s.created_at desc
  limit 1;
end;
$$;

revoke all on function public.get_my_subscription()
  from public, anon;

grant execute on function public.get_my_subscription()
  to authenticated;

comment on function public.get_my_subscription() is
  'Retorna a subscription do usuario (active/past_due/cancelled). Inclui provider_subscription_id.';
