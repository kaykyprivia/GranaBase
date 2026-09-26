-- ============================================================
-- ADMIN: leitura de webhook_events
-- ============================================================

create or replace function public.admin_list_webhook_events(
  p_limit integer default 100,
  p_offset integer default 0,
  p_only_failed boolean default false
)
returns table (
  id uuid,
  provider text,
  event_id text,
  event_type text,
  action text,
  resource_id text,
  processed boolean,
  processed_at timestamptz,
  error_message text,
  environment text,
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
    w.id,
    w.provider,
    w.event_id,
    w.event_type,
    w.action,
    w.resource_id,
    w.processed,
    w.processed_at,
    w.error_message,
    w.environment,
    w.created_at
  from public.webhook_events w
  where (not p_only_failed)
     or (p_only_failed and (w.error_message is not null or not w.processed))
  order by w.created_at desc
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.admin_list_webhook_events(integer, integer, boolean)
  from public, anon;

grant execute on function public.admin_list_webhook_events(integer, integer, boolean)
  to authenticated;

comment on function public.admin_list_webhook_events(integer, integer, boolean) is
  'Lista eventos de webhook recebidos. service_role ou SUPER_ADMIN.';

-- ============================================================
-- admin_get_webhook_stats
-- ============================================================

create or replace function public.admin_get_webhook_stats()
returns table (
  total integer,
  processed integer,
  failed integer,
  pending integer,
  last_24h integer,
  last_7d integer
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
    coalesce((select count(*)::integer from public.webhook_events), 0),
    coalesce((select count(*)::integer from public.webhook_events where processed and error_message is null), 0),
    coalesce((select count(*)::integer from public.webhook_events where error_message is not null), 0),
    coalesce((select count(*)::integer from public.webhook_events where not processed and error_message is null), 0),
    coalesce((select count(*)::integer from public.webhook_events where created_at > now() - interval '24 hours'), 0),
    coalesce((select count(*)::integer from public.webhook_events where created_at > now() - interval '7 days'), 0);
end;
$$;

revoke all on function public.admin_get_webhook_stats()
  from public, anon;

grant execute on function public.admin_get_webhook_stats()
  to authenticated;

comment on function public.admin_get_webhook_stats() is
  'Estatisticas de webhooks. service_role ou SUPER_ADMIN.';
