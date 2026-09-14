-- GranaBase Business Notifications Engine
-- Actionable, deduplicated and self-resolving business alerts.

alter table public.notifications
  add column if not exists workspace_id uuid,
  add column if not exists severity text not null default 'info',
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists dedupe_key text,
  add column if not exists action_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.notifications
  drop constraint if exists notifications_severity_check;

alter table public.notifications
  add constraint notifications_severity_check
  check (severity in ('info', 'warning', 'critical', 'success'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_workspace_user_fk'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_workspace_user_fk
      foreign key (workspace_id, user_id)
      references public.business_workspaces(id, user_id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists notifications_user_active_created_idx
  on public.notifications (user_id, created_at desc)
  where resolved_at is null;

create index if not exists notifications_workspace_active_idx
  on public.notifications (user_id, workspace_id, created_at desc)
  where workspace_id is not null
    and resolved_at is null;

create unique index if not exists notifications_active_dedupe_idx
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null
    and resolved_at is null;

create or replace function public.sync_business_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  notifications_are_enabled boolean;
  synced_count integer := 0;
  resolved_stock_count integer := 0;
  resolved_purchase_count integer := 0;
  resolved_disabled_count integer := 0;
  active_business_alerts integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select coalesce(
    (
      select settings.notifications_enabled
      from public.user_settings settings
      where settings.user_id = current_user_id
    ),
    true
  )
  into notifications_are_enabled;

  if not notifications_are_enabled then
    update public.notifications notification
    set
      resolved_at = coalesce(notification.resolved_at, now()),
      read_at = coalesce(notification.read_at, now()),
      updated_at = now()
    where notification.user_id = current_user_id
      and notification.resolved_at is null
      and notification.source_type in (
        'business_product',
        'business_purchase'
      );

    get diagnostics resolved_disabled_count = row_count;

    return jsonb_build_object(
      'enabled', false,
      'synced', 0,
      'resolved', resolved_disabled_count,
      'active', 0
    );
  end if;

  with alert_candidates as (
    select
      inventory.user_id,
      inventory.workspace_id,
      case
        when inventory.available <= 0
          then 'Estoque zerado'
        else 'Estoque baixo'
      end as title,
      case
        when inventory.available <= 0 then
          case
            when inventory.in_transit > 0 then
              concat(
                'O produto "', product.name,
                '" está sem estoque disponível. ',
                inventory.in_transit,
                ' unidade(s) estão em trânsito.'
              )
            else
              concat(
                'O produto "', product.name,
                '" está sem estoque disponível. Faça a reposição.'
              )
          end
        else
          concat(
            'O produto "', product.name,
            '" está com ',
            inventory.available,
            ' unidade(s) disponíveis. Estoque mínimo: ',
            inventory.minimum_stock,
            '.'
          )
      end as message,
      case
        when inventory.available <= 0
          then 'business_stock_out'
        else 'business_stock_low'
      end as notification_type,
      case
        when inventory.available <= 0
          then 'critical'
        else 'warning'
      end as severity,
      'business_product'::text as source_type,
      inventory.product_id as source_id,
      concat(
        'business:',
        inventory.workspace_id::text,
        ':product:',
        inventory.product_id::text,
        ':stock'
      ) as dedupe_key,
      concat(
        '/business/inventory/',
        inventory.product_id::text
      ) as action_url,
      jsonb_build_object(
        'available', inventory.available,
        'onHand', inventory.on_hand,
        'reserved', inventory.reserved,
        'inTransit', inventory.in_transit,
        'minimumStock', inventory.minimum_stock
      ) as metadata
    from public.business_inventory_summary inventory
    join public.business_products product
      on product.id = inventory.product_id
      and product.user_id = inventory.user_id
      and product.workspace_id = inventory.workspace_id
    where inventory.user_id = current_user_id
      and product.active = true
      and inventory.minimum_stock > 0
      and inventory.available <= inventory.minimum_stock

    union all

    select
      purchase.user_id,
      purchase.workspace_id,
      case
        when purchase.expected_arrival_date < current_date
          then 'Compra atrasada'
        else 'Compra chegando'
      end as title,
      case
        when purchase.expected_arrival_date < current_date then
          concat(
            'Uma compra prevista para ',
            to_char(purchase.expected_arrival_date, 'DD/MM/YYYY'),
            ' ainda está pendente',
            case
              when nullif(trim(purchase.origin), '') is not null
                then concat(' — ', trim(purchase.origin))
              else ''
            end,
            '.'
          )
        else
          concat(
            'Uma compra tem chegada prevista para ',
            to_char(purchase.expected_arrival_date, 'DD/MM/YYYY'),
            case
              when nullif(trim(purchase.origin), '') is not null
                then concat(' — ', trim(purchase.origin))
              else ''
            end,
            '.'
          )
      end as message,
      case
        when purchase.expected_arrival_date < current_date
          then 'business_purchase_overdue'
        else 'business_purchase_arriving'
      end as notification_type,
      case
        when purchase.expected_arrival_date < current_date
          then 'critical'
        when purchase.expected_arrival_date <= current_date + 2
          then 'warning'
        else 'info'
      end as severity,
      'business_purchase'::text as source_type,
      purchase.id as source_id,
      concat(
        'business:',
        purchase.workspace_id::text,
        ':purchase:',
        purchase.id::text,
        ':arrival'
      ) as dedupe_key,
      concat(
        '/business/purchases/',
        purchase.id::text
      ) as action_url,
      jsonb_build_object(
        'expectedArrivalDate', purchase.expected_arrival_date,
        'status', purchase.status,
        'origin', purchase.origin
      ) as metadata
    from public.business_purchase_orders purchase
    where purchase.user_id = current_user_id
      and purchase.expected_arrival_date is not null
      and purchase.status in (
        'PURCHASED',
        'IN_TRANSIT',
        'PARTIALLY_RECEIVED'
      )
      and purchase.expected_arrival_date <= current_date + 7
  )
  insert into public.notifications (
    user_id,
    workspace_id,
    title,
    message,
    notification_type,
    severity,
    source_type,
    source_id,
    dedupe_key,
    action_url,
    metadata
  )
  select
    candidate.user_id,
    candidate.workspace_id,
    candidate.title,
    candidate.message,
    candidate.notification_type,
    candidate.severity,
    candidate.source_type,
    candidate.source_id,
    candidate.dedupe_key,
    candidate.action_url,
    candidate.metadata
  from alert_candidates candidate
  on conflict (user_id, dedupe_key)
    where dedupe_key is not null
      and resolved_at is null
  do update
  set
    workspace_id = excluded.workspace_id,
    title = excluded.title,
    message = excluded.message,
    notification_type = excluded.notification_type,
    severity = excluded.severity,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    action_url = excluded.action_url,
    metadata = excluded.metadata,
    read_at = case
      when public.notifications.notification_type
        is distinct from excluded.notification_type
        or public.notifications.severity
        is distinct from excluded.severity
      then null
      else public.notifications.read_at
    end,
    updated_at = now();

  get diagnostics synced_count = row_count;

  update public.notifications notification
  set
    resolved_at = now(),
    read_at = coalesce(notification.read_at, now()),
    updated_at = now()
  where notification.user_id = current_user_id
    and notification.source_type = 'business_product'
    and notification.resolved_at is null
    and not exists (
      select 1
      from public.business_inventory_summary inventory
      join public.business_products product
        on product.id = inventory.product_id
        and product.user_id = inventory.user_id
        and product.workspace_id = inventory.workspace_id
      where inventory.user_id = current_user_id
        and inventory.workspace_id = notification.workspace_id
        and inventory.product_id = notification.source_id
        and product.active = true
        and inventory.minimum_stock > 0
        and inventory.available <= inventory.minimum_stock
    );

  get diagnostics resolved_stock_count = row_count;

  update public.notifications notification
  set
    resolved_at = now(),
    read_at = coalesce(notification.read_at, now()),
    updated_at = now()
  where notification.user_id = current_user_id
    and notification.source_type = 'business_purchase'
    and notification.resolved_at is null
    and not exists (
      select 1
      from public.business_purchase_orders purchase
      where purchase.id = notification.source_id
        and purchase.user_id = current_user_id
        and purchase.workspace_id = notification.workspace_id
        and purchase.expected_arrival_date is not null
        and purchase.status in (
          'PURCHASED',
          'IN_TRANSIT',
          'PARTIALLY_RECEIVED'
        )
        and purchase.expected_arrival_date <= current_date + 7
    );

  get diagnostics resolved_purchase_count = row_count;

  select count(*)::integer
  into active_business_alerts
  from public.notifications notification
  where notification.user_id = current_user_id
    and notification.resolved_at is null
    and notification.source_type in (
      'business_product',
      'business_purchase'
    );

  return jsonb_build_object(
    'enabled', true,
    'synced', synced_count,
    'resolved', resolved_stock_count + resolved_purchase_count,
    'active', active_business_alerts
  );
end;
$$;

revoke all on function public.sync_business_notifications() from public;
grant execute on function public.sync_business_notifications() to authenticated;
