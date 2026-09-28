-- ============================================================
-- FIX: get_my_missions — coluna ambigua mission_key
-- ============================================================

create or replace function public.get_my_missions()
returns table (
  mission_key text,
  title text,
  description text,
  reward_days integer,
  frequency text,
  status text,
  progress integer,
  target integer,
  completed_at timestamptz,
  rewarded_at timestamptz,
  can_claim boolean,
  extra jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_streak integer;
  v_week_key text;
  v_share_status text;
  v_streak7 record;
  v_streak30 record;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  -- Streak atual
  select coalesce(us.current_streak, 0)
  into v_streak
  from public.user_daily_streak us
  where us.user_id = v_user_id;

  v_streak := coalesce(v_streak, 0);

  -- Chave da semana (segunda-feira)
  v_week_key := to_char(
    (now() at time zone 'America/Sao_Paulo')::date - (extract(dow from (now() at time zone 'America/Sao_Paulo')::date)::integer - 1),
    'IYYY-IW'
  );

  -- Le missoes one-shot
  select um.status, um.completed_at, um.rewarded_at, um.metadata
  into v_streak7
  from public.user_missions um
  where um.user_id = v_user_id
    and um.mission_key = 'streak_7'
    and um.period_key is null
  limit 1;

  select um.status, um.completed_at, um.rewarded_at, um.metadata
  into v_streak30
  from public.user_missions um
  where um.user_id = v_user_id
    and um.mission_key = 'streak_30'
    and um.period_key is null
  limit 1;

  select um.status into v_share_status
  from public.user_missions um
  where um.user_id = v_user_id
    and um.mission_key = 'share_weekly'
    and um.period_key = v_week_key
  limit 1;

  -- STREAK 7
  mission_key := 'streak_7';
  title := 'Use o app por 7 dias seguidos';
  description := 'Acesse o GranaBase todos os dias. Ao completar 7 dias seguidos, ganhe +3 dias gratis.';
  reward_days := 3;
  frequency := 'one-shot';
  status := coalesce(v_streak7.status, case when v_streak >= 7 then 'completed' else 'in_progress' end);
  progress := least(v_streak, 7);
  target := 7;
  completed_at := v_streak7.completed_at;
  rewarded_at := v_streak7.rewarded_at;
  can_claim := false;
  extra := jsonb_build_object(
    'current_streak', v_streak,
    'blocked_reason', case when v_streak7.status = 'blocked' then v_streak7.metadata->>'reason' else null end
  );
  return next;

  -- STREAK 30
  mission_key := 'streak_30';
  title := 'Use o app por 30 dias seguidos';
  description := 'Mantenha a disciplina por 30 dias consecutivos e ganhe +5 dias gratis.';
  reward_days := 5;
  frequency := 'one-shot';
  status := coalesce(v_streak30.status, case when v_streak >= 30 then 'completed' else 'in_progress' end);
  progress := least(v_streak, 30);
  target := 30;
  completed_at := v_streak30.completed_at;
  rewarded_at := v_streak30.rewarded_at;
  can_claim := false;
  extra := jsonb_build_object(
    'current_streak', v_streak,
    'blocked_reason', case when v_streak30.status = 'blocked' then v_streak30.metadata->>'reason' else null end
  );
  return next;

  -- SHARE WEEKLY
  mission_key := 'share_weekly';
  title := 'Compartilhe o GranaBase';
  description := 'Compartilhe seu link com amigos e ganhe +1 dia gratis. Renova toda segunda-feira.';
  reward_days := 1;
  frequency := 'weekly';
  status := coalesce(v_share_status, 'in_progress');
  progress := case when v_share_status = 'rewarded' then 1 else 0 end;
  target := 1;
  completed_at := null;
  rewarded_at := null;
  can_claim := false;
  extra := jsonb_build_object('period_key', v_week_key);
  return next;
end;
$$;

revoke all on function public.get_my_missions()
  from public, anon;

grant execute on function public.get_my_missions()
  to authenticated;

comment on function public.get_my_missions() is
  'Retorna o estado atual das missoes do usuario.';
