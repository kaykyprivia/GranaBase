-- ============================================================
-- FIX: cancel_my_subscription — event_type valido + old/new status
-- ============================================================

create or replace function public.cancel_my_subscription()
returns table (
  success boolean,
  cancelled_at timestamptz,
  access_until timestamptz,
  message text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_sub_id uuid;
  v_period_end timestamptz;
  v_cancelled_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select
    s.id,
    s.current_period_end
  into
    v_sub_id,
    v_period_end
  from public.subscriptions s
  where s.user_id = v_user_id
    and s.status = 'active'
  order by s.created_at desc
  limit 1;

  if v_sub_id is null then
    return query select false, null::timestamptz, null::timestamptz,
      'Nenhuma assinatura ativa encontrada'::text;
    return;
  end if;

  update public.subscriptions s
  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  where s.id = v_sub_id
  returning s.cancelled_at into v_cancelled_at;

  begin
    insert into public.subscription_events (
      subscription_id,
      user_id,
      event_type,
      old_status,
      new_status,
      metadata
    ) values (
      v_sub_id,
      v_user_id,
      'cancelled',
      'active',
      'cancelled',
      jsonb_build_object('cancelled_via', 'cancel_my_subscription', 'cancelled_at', now())
    );
  exception when undefined_table then
    null;
  end;

  return query select
    true,
    v_cancelled_at,
    v_period_end,
    'Assinatura cancelada. Voce mantem acesso ate ' || to_char(v_period_end, 'DD/MM/YYYY')::text;
end;
$$;

revoke all on function public.cancel_my_subscription()
  from public, anon;

grant execute on function public.cancel_my_subscription()
  to authenticated;
