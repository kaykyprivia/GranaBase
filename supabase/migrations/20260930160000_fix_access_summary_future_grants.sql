-- ============================================================
-- FIX: get_my_access_summary — incluir grants futuros (empilhados)
-- ============================================================

create or replace function public.get_my_access_summary()
returns table (
  access_until timestamptz,
  days_remaining integer,
  total_bonus_days integer,
  breakdown jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  with all_active_grants as (
    -- TODOS os grants ativos (incluindo futuros empilhados)
    select
      g.product,
      g.source,
      g.starts_at,
      g.ends_at,
      g.metadata,
      g.created_at
    from public.entitlement_grants g
    where g.user_id = v_user_id
      and g.status = 'active'
      and (g.ends_at is null or g.ends_at > now())
  ),
  aggregated as (
    select
      max(ends_at) as max_ends_at,
      coalesce(sum(
        case
          when source in ('bonus', 'referral', 'admin')
            and metadata ? 'days'
          then (metadata->>'days')::integer
          else 0
        end
      ), 0) as bonus_days
    from all_active_grants
  ),
  breakdown_items as (
    select jsonb_agg(
      jsonb_build_object(
        'product', product,
        'source', source,
        'starts_at', starts_at,
        'ends_at', ends_at,
        'days', case
          when metadata ? 'days' then (metadata->>'days')::integer
          else greatest(0, ceiling(extract(epoch from (ends_at - starts_at)) / 86400))::integer
        end,
        'reason', coalesce(
          metadata->>'reason',
          metadata->>'mission_key',
          source
        ),
        'granted_at', created_at
      )
      order by starts_at asc
    ) as items
    from all_active_grants
  )
  select
    a.max_ends_at,
    case
      when a.max_ends_at is null then 0
      else greatest(0, ceiling(extract(epoch from (a.max_ends_at - now())) / 86400))::integer
    end,
    a.bonus_days::integer,
    coalesce(b.items, '[]'::jsonb)
  from aggregated a
  cross join breakdown_items b;
end;
$$;
