-- ============================================================
-- MISSIONS RPCs
-- record_daily_visit, get_my_missions, claim_mission_reward
-- ============================================================

-- Constantes:
--   streak_7    -> target 7 dias,  recompensa +3 dias, one-shot
--   streak_30   -> target 30 dias, recompensa +5 dias, one-shot
--   share_weekly -> target 1 (compartilhar), recompensa +1 dia, semanal


-- ============================================================
-- 1. record_daily_visit
-- Chamada quando o user acessa qualquer pagina autenticada
-- Idempotente por dia (Brasil)
-- ============================================================

create or replace function public.record_daily_visit()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  today_br date;
  last_visit date;
  new_streak integer;
begin
  if current_user_id is null then
    return;
  end if;

  -- Data de hoje no fuso Brasil (UTC-3)
  today_br := (now() at time zone 'America/Sao_Paulo')::date;

  -- Le estado atual
  select current_streak, last_visit_date
  into new_streak, last_visit
  from public.user_daily_streak
  where user_id = current_user_id;

  -- Ja visitou hoje? Idempotente, nao faz nada
  if last_visit is not null and last_visit = today_br then
    return;
  end if;

  -- Primeiro acesso: cria linha e inicia streak
  if new_streak is null then
    insert into public.user_daily_streak (
      user_id, current_streak, best_streak, last_visit_date
    ) values (
      current_user_id, 1, 1, today_br
    )
    on conflict (user_id) do update
      set current_streak = 1,
          best_streak = greatest(public.user_daily_streak.best_streak, 1),
          last_visit_date = today_br,
          updated_at = now();
    return;
  end if;

  -- Visitou ontem? Continua streak
  if last_visit = today_br - interval '1 day' then
    update public.user_daily_streak
    set current_streak = current_streak + 1,
        best_streak = greatest(best_streak, current_streak + 1),
        last_visit_date = today_br,
        updated_at = now()
    where user_id = current_user_id;
  else
    -- Perdeu a sequencia: reseta pra 1
    update public.user_daily_streak
    set current_streak = 1,
        last_visit_date = today_br,
        updated_at = now()
    where user_id = current_user_id;
  end if;

  -- Verifica se alguma missao de streak foi completada e tenta conceder
  perform public.check_and_reward_streak_missions();
end;
$$;

revoke all on function public.record_daily_visit()
  from public, anon;

grant execute on function public.record_daily_visit()
  to authenticated;

comment on function public.record_daily_visit() is
  'Registra visita diaria do user e atualiza streak. Idempotente por dia.';


-- ============================================================
-- 2. check_and_reward_streak_missions (helper interno)
-- Verifica se streak >= 7 ou >= 30 e concede automaticamente
-- Se nao tem acesso ativo no momento, marca como 'blocked'
-- ============================================================

create or replace function public.check_and_reward_streak_missions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_streak_val integer;
  has_any_access boolean;
  existing_status text;
  reward_personal uuid;
  reward_business uuid;
  reward_id uuid;
begin
  if current_user_id is null then
    return;
  end if;

  -- Le streak atual
  select current_streak
  into current_streak_val
  from public.user_daily_streak
  where user_id = current_user_id;

  if current_streak_val is null then
    return;
  end if;

  -- Verifica acesso ativo (personal OU business)
  has_any_access := public.has_entitlement('personal') or public.has_entitlement('business');

  -- ----- STREAK 7 -----
  if current_streak_val >= 7 then
    select status into existing_status
    from public.user_missions
    where user_id = current_user_id
      and mission_key = 'streak_7'
      and period_key is null;

    if existing_status is null then
      -- Cria e tenta conceder
      if has_any_access then
        reward_personal := public.create_bonus_grant(
          p_user_id := current_user_id,
          p_product := 'personal',
          p_days := 3,
          p_source := 'bonus',
          p_reason := 'mission-streak-7',
          p_created_by := null,
          p_referral_id := null,
          p_metadata := jsonb_build_object('mission_key', 'streak_7')
        );
        reward_business := public.create_bonus_grant(
          p_user_id := current_user_id,
          p_product := 'business',
          p_days := 3,
          p_source := 'bonus',
          p_reason := 'mission-streak-7',
          p_created_by := null,
          p_referral_id := null,
          p_metadata := jsonb_build_object('mission_key', 'streak_7')
        );

        insert into public.user_missions (
          user_id, mission_key, status, progress, target,
          completed_at, rewarded_at, metadata
        ) values (
          current_user_id, 'streak_7', 'rewarded', current_streak_val, 7,
          now(), now(),
          jsonb_build_object('personal_grant', reward_personal, 'business_grant', reward_business)
        );
      else
        insert into public.user_missions (
          user_id, mission_key, status, progress, target,
          completed_at, metadata
        ) values (
          current_user_id, 'streak_7', 'blocked', current_streak_val, 7,
          now(),
          jsonb_build_object('reason', 'no_active_access')
        );
      end if;
    elsif existing_status = 'blocked' and has_any_access then
      -- Estava bloqueado mas agora tem acesso: concede
      reward_personal := public.create_bonus_grant(
        p_user_id := current_user_id,
        p_product := 'personal',
        p_days := 3,
        p_source := 'bonus',
        p_reason := 'mission-streak-7',
        p_created_by := null,
        p_referral_id := null,
        p_metadata := jsonb_build_object('mission_key', 'streak_7')
      );
      reward_business := public.create_bonus_grant(
        p_user_id := current_user_id,
        p_product := 'business',
        p_days := 3,
        p_source := 'bonus',
        p_reason := 'mission-streak-7',
        p_created_by := null,
        p_referral_id := null,
        p_metadata := jsonb_build_object('mission_key', 'streak_7')
      );

      update public.user_missions
      set status = 'rewarded',
          rewarded_at = now(),
          metadata = metadata || jsonb_build_object(
            'personal_grant', reward_personal,
            'business_grant', reward_business
          ),
          updated_at = now()
      where user_id = current_user_id
        and mission_key = 'streak_7'
        and period_key is null;
    end if;
  end if;

  -- ----- STREAK 30 -----
  if current_streak_val >= 30 then
    select status into existing_status
    from public.user_missions
    where user_id = current_user_id
      and mission_key = 'streak_30'
      and period_key is null;

    if existing_status is null then
      if has_any_access then
        reward_personal := public.create_bonus_grant(
          p_user_id := current_user_id,
          p_product := 'personal',
          p_days := 5,
          p_source := 'bonus',
          p_reason := 'mission-streak-30',
          p_created_by := null,
          p_referral_id := null,
          p_metadata := jsonb_build_object('mission_key', 'streak_30')
        );
        reward_business := public.create_bonus_grant(
          p_user_id := current_user_id,
          p_product := 'business',
          p_days := 5,
          p_source := 'bonus',
          p_reason := 'mission-streak-30',
          p_created_by := null,
          p_referral_id := null,
          p_metadata := jsonb_build_object('mission_key', 'streak_30')
        );

        insert into public.user_missions (
          user_id, mission_key, status, progress, target,
          completed_at, rewarded_at, metadata
        ) values (
          current_user_id, 'streak_30', 'rewarded', current_streak_val, 30,
          now(), now(),
          jsonb_build_object('personal_grant', reward_personal, 'business_grant', reward_business)
        );
      else
        insert into public.user_missions (
          user_id, mission_key, status, progress, target,
          completed_at, metadata
        ) values (
          current_user_id, 'streak_30', 'blocked', current_streak_val, 30,
          now(),
          jsonb_build_object('reason', 'no_active_access')
        );
      end if;
    elsif existing_status = 'blocked' and has_any_access then
      reward_personal := public.create_bonus_grant(
        p_user_id := current_user_id,
        p_product := 'personal',
        p_days := 5,
        p_source := 'bonus',
        p_reason := 'mission-streak-30',
        p_created_by := null,
        p_referral_id := null,
        p_metadata := jsonb_build_object('mission_key', 'streak_30')
      );
      reward_business := public.create_bonus_grant(
        p_user_id := current_user_id,
        p_product := 'business',
        p_days := 5,
        p_source := 'bonus',
        p_reason := 'mission-streak-30',
        p_created_by := null,
        p_referral_id := null,
        p_metadata := jsonb_build_object('mission_key', 'streak_30')
      );

      update public.user_missions
      set status = 'rewarded',
          rewarded_at = now(),
          metadata = metadata || jsonb_build_object(
            'personal_grant', reward_personal,
            'business_grant', reward_business
          ),
          updated_at = now()
      where user_id = current_user_id
        and mission_key = 'streak_30'
        and period_key is null;
    end if;
  end if;
end;
$$;

revoke all on function public.check_and_reward_streak_missions()
  from public, anon, authenticated;


-- ============================================================
-- 3. get_my_missions
-- Retorna as 3 missoes com estado atual
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
  current_user_id uuid := auth.uid();
  current_streak integer;
  current_week_key text;
  share_status text;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  -- Streak atual
  select coalesce(us.current_streak, 0)
  into current_streak
  from public.user_daily_streak us
  where us.user_id = current_user_id;

  current_streak := coalesce(current_streak, 0);

  -- Chave da semana atual (segunda-feira)
  current_week_key := to_char(
    (now() at time zone 'America/Sao_Paulo')::date - (extract(dow from (now() at time zone 'America/Sao_Paulo')::date)::integer - 1),
    'IYYY-IW'
  );

  -- ----- STREAK 7 -----
  return query
  with m as (
    select *
    from public.user_missions
    where user_id = current_user_id
      and mission_key = 'streak_7'
      and period_key is null
  )
  select
    'streak_7'::text,
    'Use o app por 7 dias seguidos'::text,
    'Acesse o GranaBase todos os dias. Ao completar 7 dias seguidos, ganhe +3 dias gratis.'::text,
    3,
    'one-shot'::text,
    coalesce((select m.status from m), 
      case when current_streak >= 7 then 'completed' else 'in_progress' end
    )::text,
    least(current_streak, 7),
    7,
    (select m.completed_at from m),
    (select m.rewarded_at from m),
    false,
    jsonb_build_object(
      'current_streak', current_streak,
      'blocked_reason', (select m.metadata->>'reason' from m where m.status = 'blocked')
    );

  -- ----- STREAK 30 -----
  return query
  with m as (
    select *
    from public.user_missions
    where user_id = current_user_id
      and mission_key = 'streak_30'
      and period_key is null
  )
  select
    'streak_30'::text,
    'Use o app por 30 dias seguidos'::text,
    'Mantenha a disciplina por 30 dias consecutivos e ganhe +5 dias gratis.'::text,
    5,
    'one-shot'::text,
    coalesce((select m.status from m),
      case when current_streak >= 30 then 'completed' else 'in_progress' end
    )::text,
    least(current_streak, 30),
    30,
    (select m.completed_at from m),
    (select m.rewarded_at from m),
    false,
    jsonb_build_object(
      'current_streak', current_streak,
      'blocked_reason', (select m.metadata->>'reason' from m where m.status = 'blocked')
    );

  -- ----- SHARE WEEKLY -----
  select um.status into share_status
  from public.user_missions um
  where um.user_id = current_user_id
    and um.mission_key = 'share_weekly'
    and um.period_key = current_week_key;

  return query
  select
    'share_weekly'::text,
    'Compartilhe o GranaBase'::text,
    'Compartilhe seu link com amigos e ganhe +1 dia gratis. Renova toda segunda-feira.'::text,
    1,
    'weekly'::text,
    coalesce(share_status, 'in_progress')::text,
    case when share_status = 'rewarded' then 1 else 0 end,
    1,
    (select um.completed_at from public.user_missions um where um.user_id = current_user_id and um.mission_key = 'share_weekly' and um.period_key = current_week_key),
    (select um.rewarded_at from public.user_missions um where um.user_id = current_user_id and um.mission_key = 'share_weekly' and um.period_key = current_week_key),
    false,
    jsonb_build_object('period_key', current_week_key);
end;
$$;

revoke all on function public.get_my_missions()
  from public, anon;

grant execute on function public.get_my_missions()
  to authenticated;

comment on function public.get_my_missions() is
  'Retorna o estado atual das missoes do usuario.';


-- ============================================================
-- 4. claim_mission_reward
-- Concede recompensa de uma missao
-- ============================================================

create or replace function public.claim_mission_reward(p_mission_key text)
returns table (
  success boolean,
  reward_days integer,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_streak integer;
  current_week_key text;
  has_any_access boolean;
  existing_status text;
  rp uuid;
  rb uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_mission_key not in ('streak_7', 'streak_30', 'share_weekly') then
    raise exception 'Missao invalida: %', p_mission_key;
  end if;

  has_any_access := public.has_entitlement('personal') or public.has_entitlement('business');

  -- ----- STREAK 7 -----
  if p_mission_key = 'streak_7' then
    select current_streak into current_streak
    from public.user_daily_streak where user_id = current_user_id;

    if current_streak is null or current_streak < 7 then
      return query select false, 0, 'Progresso insuficiente'::text;
      return;
    end if;

    select status into existing_status from public.user_missions
    where user_id = current_user_id and mission_key = 'streak_7' and period_key is null;

    if existing_status = 'rewarded' then
      return query select false, 0, 'Missao ja resgatada'::text;
      return;
    end if;

    if not has_any_access then
      return query select false, 0, 'Voce precisa ter acesso ativo para resgatar'::text;
      return;
    end if;

    rp := public.create_bonus_grant(
      p_user_id := current_user_id, p_product := 'personal', p_days := 3,
      p_source := 'bonus', p_reason := 'mission-streak-7',
      p_created_by := null, p_referral_id := null,
      p_metadata := jsonb_build_object('mission_key', 'streak_7')
    );
    rb := public.create_bonus_grant(
      p_user_id := current_user_id, p_product := 'business', p_days := 3,
      p_source := 'bonus', p_reason := 'mission-streak-7',
      p_created_by := null, p_referral_id := null,
      p_metadata := jsonb_build_object('mission_key', 'streak_7')
    );

    insert into public.user_missions (
      user_id, mission_key, status, progress, target,
      completed_at, rewarded_at, metadata
    ) values (
      current_user_id, 'streak_7', 'rewarded', current_streak, 7,
      now(), now(),
      jsonb_build_object('personal_grant', rp, 'business_grant', rb)
    )
    on conflict (user_id, mission_key) where period_key is null
    do update set
      status = 'rewarded',
      rewarded_at = now(),
      metadata = excluded.metadata,
      updated_at = now();

    return query select true, 3, 'Voce ganhou +3 dias de acesso!'::text;
    return;
  end if;

  -- ----- STREAK 30 -----
  if p_mission_key = 'streak_30' then
    select current_streak into current_streak
    from public.user_daily_streak where user_id = current_user_id;

    if current_streak is null or current_streak < 30 then
      return query select false, 0, 'Progresso insuficiente'::text;
      return;
    end if;

    select status into existing_status from public.user_missions
    where user_id = current_user_id and mission_key = 'streak_30' and period_key is null;

    if existing_status = 'rewarded' then
      return query select false, 0, 'Missao ja resgatada'::text;
      return;
    end if;

    if not has_any_access then
      return query select false, 0, 'Voce precisa ter acesso ativo para resgatar'::text;
      return;
    end if;

    rp := public.create_bonus_grant(
      p_user_id := current_user_id, p_product := 'personal', p_days := 5,
      p_source := 'bonus', p_reason := 'mission-streak-30',
      p_created_by := null, p_referral_id := null,
      p_metadata := jsonb_build_object('mission_key', 'streak_30')
    );
    rb := public.create_bonus_grant(
      p_user_id := current_user_id, p_product := 'business', p_days := 5,
      p_source := 'bonus', p_reason := 'mission-streak-30',
      p_created_by := null, p_referral_id := null,
      p_metadata := jsonb_build_object('mission_key', 'streak_30')
    );

    insert into public.user_missions (
      user_id, mission_key, status, progress, target,
      completed_at, rewarded_at, metadata
    ) values (
      current_user_id, 'streak_30', 'rewarded', current_streak, 30,
      now(), now(),
      jsonb_build_object('personal_grant', rp, 'business_grant', rb)
    )
    on conflict (user_id, mission_key) where period_key is null
    do update set
      status = 'rewarded',
      rewarded_at = now(),
      metadata = excluded.metadata,
      updated_at = now();

    return query select true, 5, 'Voce ganhou +5 dias de acesso!'::text;
    return;
  end if;

  -- ----- SHARE WEEKLY -----
  if p_mission_key = 'share_weekly' then
    current_week_key := to_char(
      (now() at time zone 'America/Sao_Paulo')::date - (extract(dow from (now() at time zone 'America/Sao_Paulo')::date)::integer - 1),
      'IYYY-IW'
    );

    select status into existing_status from public.user_missions
    where user_id = current_user_id and mission_key = 'share_weekly' and period_key = current_week_key;

    if existing_status = 'rewarded' then
      return query select false, 0, 'Voce ja compartilhou esta semana. Volta na proxima segunda!'::text;
      return;
    end if;

    rp := public.create_bonus_grant(
      p_user_id := current_user_id, p_product := 'personal', p_days := 1,
      p_source := 'bonus', p_reason := 'mission-share-weekly',
      p_created_by := null, p_referral_id := null,
      p_metadata := jsonb_build_object('mission_key', 'share_weekly', 'period_key', current_week_key)
    );
    rb := public.create_bonus_grant(
      p_user_id := current_user_id, p_product := 'business', p_days := 1,
      p_source := 'bonus', p_reason := 'mission-share-weekly',
      p_created_by := null, p_referral_id := null,
      p_metadata := jsonb_build_object('mission_key', 'share_weekly', 'period_key', current_week_key)
    );

    insert into public.user_missions (
      user_id, mission_key, status, progress, target,
      period_key, completed_at, rewarded_at, metadata
    ) values (
      current_user_id, 'share_weekly', 'rewarded', 1, 1,
      current_week_key, now(), now(),
      jsonb_build_object('personal_grant', rp, 'business_grant', rb)
    )
    on conflict (user_id, mission_key, period_key) where period_key is not null
    do update set
      status = 'rewarded',
      rewarded_at = now(),
      metadata = excluded.metadata,
      updated_at = now();

    return query select true, 1, 'Voce ganhou +1 dia de acesso!'::text;
    return;
  end if;
end;
$$;

revoke all on function public.claim_mission_reward(text)
  from public, anon;

grant execute on function public.claim_mission_reward(text)
  to authenticated;

comment on function public.claim_mission_reward(text) is
  'Resgata recompensa de uma missao. Concede bonus (personal + business).';
