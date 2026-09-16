-- Business product categories for catalog and inventory organization.
-- Keeps product category optional and scoped by user/workspace.

create table if not exists public.business_product_categories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null,
  name            text not null,
  normalized_name text generated always as (
    lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  ) stored,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, workspace_id),
  unique (workspace_id, normalized_name),
  check (length(trim(name)) > 0),
  check (length(normalized_name) > 0),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade
);

alter table public.business_products
  add column if not exists category_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_products_category_scope_fkey'
      and conrelid = 'public.business_products'::regclass
  ) then
    alter table public.business_products
      add constraint business_products_category_scope_fkey
      foreign key (category_id, user_id, workspace_id)
      references public.business_product_categories(id, user_id, workspace_id)
      on delete restrict;
  end if;
end $$;

do $$ begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists set_business_product_categories_updated_at on public.business_product_categories;
    create trigger set_business_product_categories_updated_at before update on public.business_product_categories
      for each row execute procedure public.set_updated_at();
  end if;
end $$;

alter table public.business_product_categories enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_product_categories' and policyname = 'users can select own business_product_categories') then
    create policy "users can select own business_product_categories" on public.business_product_categories for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_product_categories' and policyname = 'users can insert own business_product_categories') then
    create policy "users can insert own business_product_categories" on public.business_product_categories for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_product_categories' and policyname = 'users can update own business_product_categories') then
    create policy "users can update own business_product_categories" on public.business_product_categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_business_product_categories_workspace
  on public.business_product_categories(user_id, workspace_id, active, name);

create index if not exists idx_business_products_workspace_category
  on public.business_products(user_id, workspace_id, category_id, active);

grant select, insert, update on public.business_product_categories to authenticated;

drop view if exists public.business_inventory_summary;

create or replace view public.business_inventory_summary
with (security_invoker = true)
as
select
  product.id as product_id,
  product.user_id,
  product.workspace_id,
  product.name,
  product.sku,
  product.category_id,
  category.name as category_name,
  product.default_sale_price,
  product.minimum_stock,
  coalesce(stock.on_hand, 0)::integer as on_hand,
  coalesce(stock.reserved, 0)::integer as reserved,
  greatest(coalesce(stock.on_hand, 0) - coalesce(stock.reserved, 0), 0)::integer as available,
  coalesce(in_transit.quantity, 0)::integer as in_transit,
  coalesce(stock.inventory_value, 0)::numeric(12,2) as inventory_value,
  case
    when coalesce(stock.on_hand, 0) > 0 then round(stock.inventory_value / stock.on_hand, 2)
    else 0
  end::numeric(12,2) as average_unit_cost,
  case
    when product.default_sale_price is not null and coalesce(stock.on_hand, 0) > 0 then
      round((product.default_sale_price * coalesce(stock.on_hand, 0)) - stock.inventory_value, 2)
    else 0
  end::numeric(12,2) as estimated_profit,
  product.barcode,
  product.image_url,
  product.active,
  product.created_at,
  product.updated_at,
  movement_stats.last_movement_at,
  coalesce(purchase_stats.total_purchased, 0)::integer as total_purchased,
  coalesce(purchase_stats.total_received, 0)::integer as total_received,
  coalesce(sale_stats.total_sold, 0)::integer as total_sold
from public.business_products product
left join public.business_product_categories category
  on category.id = product.category_id
  and category.user_id = product.user_id
  and category.workspace_id = product.workspace_id
left join (
  select user_id, workspace_id, product_id, sum(remaining_quantity) as on_hand, sum(reserved_quantity) as reserved, sum(remaining_quantity * unit_cost) as inventory_value
  from public.business_inventory_lots
  group by user_id, workspace_id, product_id
) stock on stock.product_id = product.id and stock.user_id = product.user_id and stock.workspace_id = product.workspace_id
left join (
  select item.user_id, item.workspace_id, item.product_id, sum(item.quantity_ordered - item.quantity_received) as quantity
  from public.business_purchase_items item
  join public.business_purchase_orders po
    on po.id = item.purchase_order_id and po.user_id = item.user_id and po.workspace_id = item.workspace_id
  where po.status in ('PURCHASED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')
  group by item.user_id, item.workspace_id, item.product_id
) in_transit on in_transit.product_id = product.id and in_transit.user_id = product.user_id and in_transit.workspace_id = product.workspace_id
left join (
  select user_id, workspace_id, product_id, max(created_at) as last_movement_at
  from public.business_inventory_movements
  group by user_id, workspace_id, product_id
) movement_stats on movement_stats.product_id = product.id and movement_stats.user_id = product.user_id and movement_stats.workspace_id = product.workspace_id
left join (
  select user_id, workspace_id, product_id, sum(quantity_ordered) as total_purchased, sum(quantity_received) as total_received
  from public.business_purchase_items
  group by user_id, workspace_id, product_id
) purchase_stats on purchase_stats.product_id = product.id and purchase_stats.user_id = product.user_id and purchase_stats.workspace_id = product.workspace_id
left join (
  select user_id, workspace_id, product_id, sum(abs(quantity_delta)) as total_sold
  from public.business_inventory_movements
  where movement_type = 'SALE_OUT'
  group by user_id, workspace_id, product_id
) sale_stats on sale_stats.product_id = product.id and sale_stats.user_id = product.user_id and sale_stats.workspace_id = product.workspace_id
where
  product.active = true
  or coalesce(stock.on_hand, 0) > 0
  or coalesce(in_transit.quantity, 0) > 0
  or movement_stats.last_movement_at is not null
  or coalesce(purchase_stats.total_purchased, 0) > 0;

grant select on public.business_inventory_summary to authenticated;

create or replace function public.business_resolve_product_category(
  p_workspace_id uuid,
  p_user_id uuid,
  p_category_id uuid default null,
  p_category_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_id uuid;
  normalized_input text;
begin
  if p_category_id is not null and nullif(trim(p_category_name), '') is not null then
    raise exception 'Informe categoria por id ou por nome, nao ambos';
  end if;

  if p_category_id is not null then
    select id into resolved_id
    from public.business_product_categories
    where id = p_category_id
      and user_id = p_user_id
      and workspace_id = p_workspace_id
      and active = true;

    if not found then
      raise exception 'Categoria de produto nao encontrada';
    end if;

    return resolved_id;
  end if;

  if nullif(trim(p_category_name), '') is null then
    return null;
  end if;

  normalized_input := lower(regexp_replace(trim(p_category_name), '\s+', ' ', 'g'));

  perform pg_advisory_xact_lock(
    hashtextextended(p_workspace_id::text || ':product_category:' || normalized_input, 0)
  );

  insert into public.business_product_categories (user_id, workspace_id, name, active)
  values (p_user_id, p_workspace_id, trim(p_category_name), true)
  on conflict (workspace_id, normalized_name)
  do update set active = true, name = excluded.name, updated_at = now()
  returning id into resolved_id;

  return resolved_id;
end;
$$;

revoke execute on function public.business_resolve_product_category(uuid, uuid, uuid, text) from public, anon, authenticated;

drop function if exists public.update_business_product_metadata(
  uuid,
  uuid,
  text,
  text,
  text,
  numeric,
  integer,
  boolean
);

drop function if exists public.update_business_product_metadata(
  uuid,
  uuid,
  text,
  text,
  text,
  numeric,
  integer,
  boolean,
  uuid
);

create or replace function public.update_business_product_metadata(
  p_workspace_id uuid,
  p_product_id uuid,
  p_idempotency_key text,
  p_name text,
  p_sku text default null,
  p_default_sale_price numeric default null,
  p_minimum_stock integer default 0,
  p_active boolean default true,
  p_category_id uuid default null,
  p_category_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  product_row public.business_products%rowtype;
  normalized_sku text;
  resolved_category_id uuid;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;
  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  request_hash := md5(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'product_id', p_product_id,
    'name', p_name,
    'sku', p_sku,
    'default_sale_price', p_default_sale_price,
    'minimum_stock', p_minimum_stock,
    'active', p_active,
    'category_id', p_category_id,
    'category_name', p_category_name
  )::text);
  existing_response := public.business_claim_idempotency(current_user_id, p_workspace_id, 'update_business_product_metadata', p_idempotency_key, request_hash);
  if existing_response is not null then
    return existing_response;
  end if;

  select *
  into product_row
  from public.business_products
  where id = p_product_id
    and user_id = current_user_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Produto nao encontrado';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Nome do produto e obrigatorio';
  end if;
  if p_minimum_stock is null or p_minimum_stock < 0 then
    raise exception 'Estoque minimo nao pode ser negativo';
  end if;
  if p_default_sale_price is not null and p_default_sale_price < 0 then
    raise exception 'Preco de venda nao pode ser negativo';
  end if;

  resolved_category_id := public.business_resolve_product_category(
    p_workspace_id,
    current_user_id,
    p_category_id,
    p_category_name
  );

  normalized_sku := nullif(trim(p_sku), '');
  if normalized_sku is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_workspace_id::text || ':product_sku:' || lower(normalized_sku), 0)
    );

    if coalesce(p_active, true) and exists (
      select 1
      from public.business_products
      where user_id = current_user_id
        and workspace_id = p_workspace_id
        and id <> p_product_id
        and active = true
        and lower(trim(sku)) = lower(normalized_sku)
    ) then
      raise exception 'SKU ja cadastrado neste negocio';
    end if;
  end if;

  update public.business_products
  set
    name = trim(p_name),
    sku = normalized_sku,
    category_id = resolved_category_id,
    default_sale_price = case when p_default_sale_price is null then null else round(p_default_sale_price, 2) end,
    minimum_stock = p_minimum_stock,
    active = coalesce(p_active, true),
    updated_at = now()
  where id = p_product_id
    and user_id = current_user_id
    and workspace_id = p_workspace_id;

  perform public.business_log_audit(current_user_id, current_user_id, p_workspace_id, 'product', p_product_id, 'product_metadata_updated', jsonb_build_object(
    'name', trim(p_name),
    'sku', normalized_sku,
    'category_id', resolved_category_id,
    'default_sale_price', case when p_default_sale_price is null then null else round(p_default_sale_price, 2) end,
    'minimum_stock', p_minimum_stock,
    'active', coalesce(p_active, true)
  ));

  response := jsonb_build_object('product_id', p_product_id, 'category_id', resolved_category_id);
  perform public.business_complete_idempotency(current_user_id, p_workspace_id, 'update_business_product_metadata', p_idempotency_key, response);
  return response;
end;
$$;

revoke execute on function public.update_business_product_metadata(uuid, uuid, text, text, text, numeric, integer, boolean, uuid, text) from public, anon;
grant execute on function public.update_business_product_metadata(uuid, uuid, text, text, text, numeric, integer, boolean, uuid, text) to authenticated;

drop function if exists public.get_business_inventory_page(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  integer,
  integer
);

create or replace function public.get_business_inventory_page(
  p_workspace_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_filter text default 'all',
  p_sort text default 'name',
  p_search text default null,
  p_category_id text default null,
  p_window_days integer default 30,
  p_target_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_page integer := greatest(coalesce(p_page, 1), 1);
  resolved_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  resolved_window_days integer := coalesce(p_window_days, 30);
  resolved_target_days integer := coalesce(p_target_days, 30);
  resolved_category_id uuid;
  resolved_search text := translate(lower(trim(coalesce(p_search, ''))), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  if p_filter is null or p_filter not in ('all', 'available', 'low', 'empty', 'reserved', 'in_transit', 'reorder', 'no_recent_turnover') then
    raise exception 'Filtro de estoque invalido';
  end if;

  if p_sort is null or p_sort not in ('name', 'stock_desc', 'stock_asc', 'capital_desc', 'cost_desc', 'recent', 'coverage_asc', 'velocity_desc', 'reorder_desc') then
    raise exception 'Ordenacao de estoque invalida';
  end if;

  if resolved_window_days < 7 or resolved_window_days > 180 then
    raise exception 'Janela de inteligencia deve estar entre 7 e 180 dias';
  end if;

  if resolved_target_days < 7 or resolved_target_days > 180 then
    raise exception 'Horizonte de reposicao deve estar entre 7 e 180 dias';
  end if;

  if nullif(trim(coalesce(p_category_id, '')), '') is not null and p_category_id not in ('all', 'uncategorized') then
    resolved_category_id := p_category_id::uuid;
    if not exists (
      select 1
      from public.business_product_categories
      where id = resolved_category_id
        and user_id = current_user_id
        and workspace_id = p_workspace_id
        and active = true
    ) then
      raise exception 'Categoria de produto nao encontrada';
    end if;
  end if;

  return (
    with recent_movement_stats as (
      select
        movement.product_id,
        coalesce(sum(case when movement.movement_type = 'SALE_OUT' then abs(movement.quantity_delta) else 0 end), 0)::integer as gross_sold,
        coalesce(sum(case when movement.movement_type = 'CUSTOMER_RETURN' then greatest(movement.quantity_delta, 0) else 0 end), 0)::integer as customer_returns
      from public.business_inventory_movements movement
      where movement.user_id = current_user_id
        and movement.workspace_id = p_workspace_id
        and movement.movement_type in ('SALE_OUT', 'CUSTOMER_RETURN')
        and movement.created_at >= (current_date - (resolved_window_days - 1))::timestamptz
      group by movement.product_id
    ),
    last_sale_stats as (
      select movement.product_id, max(movement.created_at) as last_sale_at
      from public.business_inventory_movements movement
      where movement.user_id = current_user_id
        and movement.workspace_id = p_workspace_id
        and movement.movement_type = 'SALE_OUT'
      group by movement.product_id
    ),
    inventory_base as (
      select
        inventory.*,
        coalesce(recent.gross_sold, 0)::integer as gross_sold_window,
        coalesce(recent.customer_returns, 0)::integer as customer_returns_window,
        greatest(coalesce(recent.gross_sold, 0) - coalesce(recent.customer_returns, 0), 0)::integer as net_outflow_window,
        last_sale.last_sale_at,
        least(resolved_window_days, greatest(1, (current_date - inventory.created_at::date + 1)))::integer as observation_days
      from public.business_inventory_summary inventory
      left join recent_movement_stats recent on recent.product_id = inventory.product_id
      left join last_sale_stats last_sale on last_sale.product_id = inventory.product_id
      where inventory.user_id = current_user_id
        and inventory.workspace_id = p_workspace_id
        and (
          p_category_id is null
          or p_category_id = 'all'
          or (p_category_id = 'uncategorized' and inventory.category_id is null)
          or inventory.category_id = resolved_category_id
        )
    ),
    velocity as (
      select inventory_base.*, (inventory_base.net_outflow_window::numeric / nullif(inventory_base.observation_days, 0)) as daily_outflow_raw
      from inventory_base
    ),
    scored as (
      select
        velocity.*,
        round(velocity.daily_outflow_raw, 4) as average_daily_outflow,
        case when velocity.daily_outflow_raw > 0 then round(velocity.available / velocity.daily_outflow_raw, 1) else null end as coverage_days,
        case when velocity.daily_outflow_raw > 0 then round((velocity.available + velocity.in_transit) / velocity.daily_outflow_raw, 1) else null end as projected_coverage_days,
        greatest(velocity.minimum_stock, ceil(velocity.daily_outflow_raw * resolved_target_days)::integer)::integer as target_stock,
        case when velocity.last_sale_at is null then null else (current_date - velocity.last_sale_at::date)::integer end as days_since_last_sale
      from velocity
    ),
    replenishment as (
      select scored.*, greatest(scored.target_stock - scored.available - scored.in_transit, 0)::integer as suggested_reorder_quantity
      from scored
    ),
    classified as (
      select
        replenishment.*,
        case
          when replenishment.available = 0 and replenishment.in_transit = 0 then 'out_of_stock'
          when replenishment.suggested_reorder_quantity > 0 and ((replenishment.minimum_stock > 0 and replenishment.available <= replenishment.minimum_stock) or (replenishment.coverage_days is not null and replenishment.coverage_days <= 7)) then 'reorder_now'
          when replenishment.available = 0 or replenishment.suggested_reorder_quantity > 0 then 'attention'
          when replenishment.on_hand > 0 and replenishment.gross_sold_window = 0 and replenishment.observation_days >= resolved_window_days then 'no_recent_turnover'
          else 'healthy'
        end as intelligence_status
      from replenishment
    ),
    filtered as (
      select *
      from classified
      where (
        p_filter = 'all'
        or (p_filter = 'available' and available > 0)
        or (p_filter = 'low' and minimum_stock > 0 and available <= minimum_stock)
        or (p_filter = 'empty' and on_hand = 0 and in_transit = 0)
        or (p_filter = 'reserved' and reserved > 0)
        or (p_filter = 'in_transit' and in_transit > 0)
        or (p_filter = 'reorder' and suggested_reorder_quantity > 0)
        or (p_filter = 'no_recent_turnover' and intelligence_status = 'no_recent_turnover')
      )
      and (
        resolved_search = ''
        or position(
          resolved_search in translate(lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(barcode, '') || ' ' || coalesce(category_name, '') || ' ' || product_id::text), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
        ) > 0
      )
    ),
    counts as (
      select count(*)::integer as total_count from filtered
    ),
    page_rows as (
      select *
      from filtered
      order by
        case when p_sort = 'stock_desc' then available end desc nulls last,
        case when p_sort = 'stock_asc' then available end asc nulls last,
        case when p_sort = 'capital_desc' then inventory_value end desc nulls last,
        case when p_sort = 'cost_desc' then average_unit_cost end desc nulls last,
        case when p_sort = 'recent' then last_movement_at end desc nulls last,
        case when p_sort = 'coverage_asc' then coverage_days end asc nulls last,
        case when p_sort = 'velocity_desc' then average_daily_outflow end desc nulls last,
        case when p_sort = 'reorder_desc' then suggested_reorder_quantity end desc nulls last,
        case when p_sort = 'name' then lower(name) end asc nulls last,
        lower(name) asc,
        product_id asc
      offset (resolved_page - 1) * resolved_page_size
      limit resolved_page_size
    ),
    inventory_summary as (
      select
        coalesce(sum(inventory_value), 0)::numeric(14,2) as inventory_value,
        count(*) filter (where on_hand > 0)::integer as products_in_stock,
        coalesce(sum(available), 0)::integer as available_units,
        count(*) filter (where minimum_stock > 0 and available <= minimum_stock)::integer as low_stock_products,
        count(*) filter (where on_hand = 0 and in_transit = 0)::integer as out_of_stock_products,
        coalesce(sum(in_transit), 0)::integer as in_transit_units,
        count(*) filter (where intelligence_status in ('out_of_stock', 'reorder_now') and suggested_reorder_quantity > 0)::integer as reorder_now_products,
        count(*) filter (where intelligence_status = 'attention')::integer as attention_products,
        count(*) filter (where intelligence_status = 'no_recent_turnover')::integer as no_recent_turnover_products,
        coalesce(sum(suggested_reorder_quantity), 0)::integer as suggested_reorder_units
      from classified
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb),
      'total_count', (select total_count from counts),
      'page', resolved_page,
      'page_size', resolved_page_size,
      'total_pages', case when (select total_count from counts) = 0 then 0 else ceil((select total_count from counts)::numeric / resolved_page_size)::integer end,
      'window_days', resolved_window_days,
      'target_days', resolved_target_days,
      'summary', (
        select jsonb_build_object(
          'inventory_value', inventory_value,
          'products_in_stock', products_in_stock,
          'available_units', available_units,
          'low_stock_products', low_stock_products,
          'out_of_stock_products', out_of_stock_products,
          'in_transit_units', in_transit_units,
          'reorder_now_products', reorder_now_products,
          'attention_products', attention_products,
          'no_recent_turnover_products', no_recent_turnover_products,
          'suggested_reorder_units', suggested_reorder_units
        )
        from inventory_summary
      )
    )
  );
end;
$$;

revoke execute on function public.get_business_inventory_page(uuid, integer, integer, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.get_business_inventory_page(uuid, integer, integer, text, text, text, text, integer, integer) to authenticated;

create or replace function public.create_business_purchase_multi(
  p_workspace_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_shipping_cost numeric default 0,
  p_additional_costs numeric default 0,
  p_purchase_date date default current_date,
  p_expected_arrival_date date default null,
  p_origin text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  item_payload jsonb;
  purchase_id uuid;
  purchase_item_id uuid;
  product_id_value uuid;
  product_name_value text;
  product_sku_value text;
  category_id_value uuid;
  category_name_value text;
  default_sale_price_value numeric;
  minimum_stock_value integer;
  quantity_value integer;
  unit_cost_value numeric(18,6);
  line_subtotal numeric(12,2);
  product_subtotal numeric(12,2) := 0;
  total_quantity integer := 0;
  shipping_cost_value numeric(12,2);
  additional_costs_value numeric(12,2);
  extra_total numeric(12,2);
  total_cost numeric(12,2);
  allocated_extra numeric(12,2);
  allocated_so_far numeric(12,2) := 0;
  real_unit_cost numeric(18,6);
  item_count integer;
  item_index integer := 0;
  seen_product_ids uuid[] := array[]::uuid[];
  seen_skus text[] := array[]::text[];
  request_hash text;
  existing_response jsonb;
  response jsonb;
  response_items jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'A compra precisa ter pelo menos um item';
  end if;

  item_count := jsonb_array_length(p_items);

  if item_count > 100 then
    raise exception 'A compra excede o limite de 100 itens';
  end if;

  shipping_cost_value := round(coalesce(p_shipping_cost, 0), 2);
  additional_costs_value := round(coalesce(p_additional_costs, 0), 2);

  if shipping_cost_value < 0 or additional_costs_value < 0 then
    raise exception 'Custos adicionais nao podem ser negativos';
  end if;

  request_hash := md5(
    jsonb_build_object(
      'workspace_id', p_workspace_id,
      'items', p_items,
      'shipping_cost', shipping_cost_value,
      'additional_costs', additional_costs_value,
      'purchase_date', p_purchase_date,
      'expected_arrival_date', p_expected_arrival_date,
      'origin', p_origin,
      'notes', p_notes
    )::text
  );

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_purchase_multi',
    p_idempotency_key,
    request_hash
  );

  if existing_response is not null then
    return existing_response;
  end if;

  for item_payload in
    select value
    from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item_payload) <> 'object' then
      raise exception 'Item de compra invalido';
    end if;

    quantity_value := nullif(item_payload->>'quantity', '')::integer;
    unit_cost_value := round(nullif(item_payload->>'unit_purchase_cost', '')::numeric, 6);

    if quantity_value is null or quantity_value <= 0 then
      raise exception 'Quantidade de item deve ser positiva';
    end if;

    if unit_cost_value is null or unit_cost_value < 0 then
      raise exception 'Custo unitario do item nao pode ser negativo';
    end if;

    product_id_value := nullif(item_payload->>'product_id', '')::uuid;
    product_name_value := nullif(trim(item_payload->>'product_name'), '');

    if product_id_value is null and product_name_value is null then
      raise exception 'Cada item precisa informar um produto existente ou um novo produto';
    end if;

    if product_id_value is not null and product_name_value is not null then
      raise exception 'Item nao pode informar produto existente e novo produto ao mesmo tempo';
    end if;

    if product_id_value is not null then
      if product_id_value = any(seen_product_ids) then
        raise exception 'O mesmo produto nao pode aparecer duas vezes na compra';
      end if;

      if not exists (
        select 1
        from public.business_products
        where id = product_id_value
          and user_id = current_user_id
          and workspace_id = p_workspace_id
          and active = true
      ) then
        raise exception 'Produto nao encontrado';
      end if;

      seen_product_ids := array_append(
        seen_product_ids,
        product_id_value
      );
    else
      product_sku_value := nullif(
        trim(item_payload->>'product_sku'),
        ''
      );

      if product_sku_value is not null then
        if lower(product_sku_value) = any(seen_skus) then
          raise exception 'SKU repetido entre os novos produtos da compra';
        end if;

        seen_skus := array_append(
          seen_skus,
          lower(product_sku_value)
        );
      end if;

      category_id_value := nullif(item_payload->>'product_category_id', '')::uuid;
      category_name_value := nullif(trim(item_payload->>'product_category_name'), '');

      if category_id_value is not null and category_name_value is not null then
        raise exception 'Informe categoria por id ou por nome, nao ambos';
      end if;

      if category_id_value is not null and not exists (
        select 1
        from public.business_product_categories
        where id = category_id_value
          and user_id = current_user_id
          and workspace_id = p_workspace_id
          and active = true
      ) then
        raise exception 'Categoria de produto nao encontrada';
      end if;

      default_sale_price_value :=
        nullif(item_payload->>'default_sale_price', '')::numeric;

      minimum_stock_value :=
        coalesce(
          nullif(item_payload->>'minimum_stock', '')::integer,
          0
        );

      if default_sale_price_value is not null
         and default_sale_price_value < 0 then
        raise exception 'Preco de venda nao pode ser negativo';
      end if;

      if minimum_stock_value < 0 then
        raise exception 'Estoque minimo nao pode ser negativo';
      end if;
    end if;

    line_subtotal := round(
      quantity_value * unit_cost_value,
      2
    );

    product_subtotal := round(
      product_subtotal + line_subtotal,
      2
    );

    total_quantity := total_quantity + quantity_value;
  end loop;

  extra_total := round(
    shipping_cost_value + additional_costs_value,
    2
  );

  total_cost := round(
    product_subtotal + extra_total,
    2
  );

  insert into public.business_purchase_orders (
    user_id,
    workspace_id,
    purchase_date,
    expected_arrival_date,
    origin,
    product_subtotal,
    shipping_cost,
    additional_costs,
    total_cost,
    status,
    notes
  )
  values (
    current_user_id,
    p_workspace_id,
    coalesce(p_purchase_date, current_date),
    p_expected_arrival_date,
    nullif(trim(p_origin), ''),
    product_subtotal,
    shipping_cost_value,
    additional_costs_value,
    total_cost,
    'PURCHASED',
    nullif(trim(p_notes), '')
  )
  returning id into purchase_id;

  for item_payload in
    select value
    from jsonb_array_elements(p_items)
  loop
    item_index := item_index + 1;

    quantity_value := (item_payload->>'quantity')::integer;
    unit_cost_value := round((item_payload->>'unit_purchase_cost')::numeric, 6);
    product_id_value := nullif(item_payload->>'product_id', '')::uuid;

    if product_id_value is null then
      product_name_value := trim(item_payload->>'product_name');
      product_sku_value := nullif(
        trim(item_payload->>'product_sku'),
        ''
      );

      category_id_value := public.business_resolve_product_category(
        p_workspace_id,
        current_user_id,
        nullif(item_payload->>'product_category_id', '')::uuid,
        nullif(trim(item_payload->>'product_category_name'), '')
      );

      default_sale_price_value :=
        nullif(item_payload->>'default_sale_price', '')::numeric;

      minimum_stock_value :=
        coalesce(
          nullif(item_payload->>'minimum_stock', '')::integer,
          0
        );

      if product_sku_value is not null then
        perform pg_advisory_xact_lock(
          hashtextextended(
            p_workspace_id::text
            || ':product_sku:'
            || lower(product_sku_value),
            0
          )
        );

        if exists (
          select 1
          from public.business_products
          where user_id = current_user_id
            and workspace_id = p_workspace_id
            and lower(trim(sku)) = lower(product_sku_value)
        ) then
          raise exception 'SKU ja cadastrado neste negocio';
        end if;
      end if;

      insert into public.business_products (
        user_id,
        workspace_id,
        name,
        sku,
        category_id,
        default_sale_price,
        minimum_stock
      )
      values (
        current_user_id,
        p_workspace_id,
        product_name_value,
        product_sku_value,
        category_id_value,
        case
          when default_sale_price_value is null then null
          else round(default_sale_price_value, 2)
        end,
        minimum_stock_value
      )
      returning id into product_id_value;
    end if;

    line_subtotal := round(
      quantity_value * unit_cost_value,
      2
    );

    if item_index = item_count then
      allocated_extra := round(
        extra_total - allocated_so_far,
        2
      );
    elsif extra_total = 0 then
      allocated_extra := 0;
    elsif product_subtotal > 0 then
      allocated_extra := round(
        extra_total * line_subtotal / product_subtotal,
        2
      );
    else
      allocated_extra := round(
        extra_total * quantity_value / total_quantity,
        2
      );
    end if;

    allocated_so_far := round(
      allocated_so_far + allocated_extra,
      2
    );

    real_unit_cost := round(
      (
        line_subtotal
        + allocated_extra
      ) / quantity_value,
      6
    );

    insert into public.business_purchase_items (
      user_id,
      workspace_id,
      purchase_order_id,
      product_id,
      quantity_ordered,
      quantity_received,
      unit_purchase_cost,
      allocated_extra_cost,
      real_unit_cost
    )
    values (
      current_user_id,
      p_workspace_id,
      purchase_id,
      product_id_value,
      quantity_value,
      0,
      unit_cost_value,
      allocated_extra,
      real_unit_cost
    )
    returning id into purchase_item_id;

    response_items := response_items || jsonb_build_array(
      jsonb_build_object(
        'purchase_item_id', purchase_item_id,
        'product_id', product_id_value,
        'quantity_ordered', quantity_value,
        'unit_purchase_cost', unit_cost_value,
        'allocated_extra_cost', allocated_extra,
        'real_unit_cost', real_unit_cost
      )
    );
  end loop;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    p_workspace_id,
    'purchase_order',
    purchase_id,
    'purchase_created',
    jsonb_build_object(
      'item_count', item_count,
      'quantity', total_quantity,
      'product_subtotal', product_subtotal,
      'shipping_cost', shipping_cost_value,
      'additional_costs', additional_costs_value,
      'total_cost', total_cost
    )
  );

  response := jsonb_build_object(
    'purchase_order_id', purchase_id,
    'status', 'PURCHASED',
    'item_count', item_count,
    'quantity_ordered', total_quantity,
    'product_subtotal', product_subtotal,
    'shipping_cost', shipping_cost_value,
    'additional_costs', additional_costs_value,
    'total_cost', total_cost,
    'items', response_items
  );

  perform public.business_complete_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_purchase_multi',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

create or replace function public.update_business_purchase_multi(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_shipping_cost numeric default 0,
  p_additional_costs numeric default 0,
  p_purchase_date date default null,
  p_expected_arrival_date date default null,
  p_origin text default null,
  p_notes text default null,
  p_clear_expected_arrival_date boolean default false,
  p_clear_origin boolean default false,
  p_clear_notes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  purchase_row public.business_purchase_orders%rowtype;
  existing_item public.business_purchase_items%rowtype;
  item_payload jsonb;
  purchase_item_id uuid;
  product_id_value uuid;
  product_name_value text;
  product_sku_value text;
  category_id_value uuid;
  category_name_value text;
  default_sale_price_value numeric;
  minimum_stock_value integer;
  quantity_value integer;
  unit_cost_value numeric(18,6);
  line_subtotal numeric(12,2);
  next_product_subtotal numeric(12,2) := 0;
  total_quantity integer := 0;
  shipping_cost_value numeric(12,2);
  additional_costs_value numeric(12,2);
  extra_total numeric(12,2);
  next_total_cost numeric(12,2);
  allocated_extra numeric(12,2);
  allocated_so_far numeric(12,2) := 0;
  real_unit_cost numeric(18,6);
  item_count integer;
  item_index integer := 0;
  existing_item_count integer := 0;
  seen_product_ids uuid[] := array[]::uuid[];
  seen_skus text[] := array[]::text[];
  request_hash text;
  existing_response jsonb;
  response jsonb;
  response_items jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into purchase_row
  from public.business_purchase_orders
  where id = p_purchase_order_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Compra nao encontrada';
  end if;

  if purchase_row.status not in (
    'DRAFT',
    'PURCHASED',
    'IN_TRANSIT'
  ) then
    raise exception 'Compra nao pode ser editada no status atual';
  end if;

  for existing_item in
    select *
    from public.business_purchase_items
    where purchase_order_id = purchase_row.id
      and user_id = current_user_id
      and workspace_id = purchase_row.workspace_id
    order by created_at, id
    for update
  loop
    existing_item_count := existing_item_count + 1;

    if existing_item.quantity_received > 0 then
      raise exception 'Compra com recebimento iniciado nao pode alterar produtos, quantidades ou custos';
    end if;
  end loop;

  if existing_item_count = 0 then
    raise exception 'Compra sem itens';
  end if;

  if exists (
    select 1
    from public.business_inventory_lots lot
    join public.business_purchase_items item
      on item.id = lot.purchase_item_id
    where item.purchase_order_id = purchase_row.id
      and item.user_id = current_user_id
      and item.workspace_id = purchase_row.workspace_id
  ) then
    raise exception 'Compra com movimentacao de estoque nao pode ser reestruturada';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'A compra precisa ter pelo menos um item';
  end if;

  item_count := jsonb_array_length(p_items);

  if item_count > 100 then
    raise exception 'A compra excede o limite de 100 itens';
  end if;

  shipping_cost_value := round(
    coalesce(p_shipping_cost, purchase_row.shipping_cost, 0),
    2
  );

  additional_costs_value := round(
    coalesce(p_additional_costs, purchase_row.additional_costs, 0),
    2
  );

  if shipping_cost_value < 0
     or additional_costs_value < 0 then
    raise exception 'Custos adicionais nao podem ser negativos';
  end if;

  request_hash := md5(
    jsonb_build_object(
      'purchase_order_id', p_purchase_order_id,
      'items', p_items,
      'shipping_cost', shipping_cost_value,
      'additional_costs', additional_costs_value,
      'purchase_date', p_purchase_date,
      'expected_arrival_date', p_expected_arrival_date,
      'origin', p_origin,
      'notes', p_notes,
      'clear_expected_arrival_date', p_clear_expected_arrival_date,
      'clear_origin', p_clear_origin,
      'clear_notes', p_clear_notes,
      'status', purchase_row.status
    )::text
  );

  existing_response := public.business_claim_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'update_business_purchase_multi',
    p_idempotency_key,
    request_hash
  );

  if existing_response is not null then
    return existing_response;
  end if;

  for item_payload in
    select value
    from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item_payload) <> 'object' then
      raise exception 'Item de compra invalido';
    end if;

    quantity_value :=
      nullif(item_payload->>'quantity', '')::integer;

    unit_cost_value := round(nullif(item_payload->>'unit_purchase_cost', '')::numeric, 6);

    if quantity_value is null or quantity_value <= 0 then
      raise exception 'Quantidade de item deve ser positiva';
    end if;

    if unit_cost_value is null or unit_cost_value < 0 then
      raise exception 'Custo unitario do item nao pode ser negativo';
    end if;

    product_id_value :=
      nullif(item_payload->>'product_id', '')::uuid;

    product_name_value :=
      nullif(trim(item_payload->>'product_name'), '');

    if product_id_value is null
       and product_name_value is null then
      raise exception 'Cada item precisa informar um produto existente ou um novo produto';
    end if;

    if product_id_value is not null
       and product_name_value is not null then
      raise exception 'Item nao pode informar produto existente e novo produto ao mesmo tempo';
    end if;

    if product_id_value is not null then
      if product_id_value = any(seen_product_ids) then
        raise exception 'O mesmo produto nao pode aparecer duas vezes na compra';
      end if;

      if not exists (
        select 1
        from public.business_products
        where id = product_id_value
          and user_id = current_user_id
          and workspace_id = purchase_row.workspace_id
          and active = true
      ) then
        raise exception 'Produto nao encontrado';
      end if;

      seen_product_ids := array_append(
        seen_product_ids,
        product_id_value
      );
    else
      product_sku_value := nullif(
        trim(item_payload->>'product_sku'),
        ''
      );

      if product_sku_value is not null then
        if lower(product_sku_value) = any(seen_skus) then
          raise exception 'SKU repetido entre os novos produtos da compra';
        end if;

        seen_skus := array_append(
          seen_skus,
          lower(product_sku_value)
        );
      end if;

      category_id_value := nullif(item_payload->>'product_category_id', '')::uuid;
      category_name_value := nullif(trim(item_payload->>'product_category_name'), '');

      if category_id_value is not null and category_name_value is not null then
        raise exception 'Informe categoria por id ou por nome, nao ambos';
      end if;

      if category_id_value is not null and not exists (
        select 1
        from public.business_product_categories
        where id = category_id_value
          and user_id = current_user_id
          and workspace_id = purchase_row.workspace_id
          and active = true
      ) then
        raise exception 'Categoria de produto nao encontrada';
      end if;

      default_sale_price_value :=
        nullif(item_payload->>'default_sale_price', '')::numeric;

      minimum_stock_value := coalesce(
        nullif(item_payload->>'minimum_stock', '')::integer,
        0
      );

      if default_sale_price_value is not null
         and default_sale_price_value < 0 then
        raise exception 'Preco de venda nao pode ser negativo';
      end if;

      if minimum_stock_value < 0 then
        raise exception 'Estoque minimo nao pode ser negativo';
      end if;
    end if;

    line_subtotal := round(
      quantity_value * unit_cost_value,
      2
    );

    next_product_subtotal := round(
      next_product_subtotal + line_subtotal,
      2
    );

    total_quantity :=
      total_quantity + quantity_value;
  end loop;

  extra_total := round(
    shipping_cost_value + additional_costs_value,
    2
  );

  next_total_cost := round(
    next_product_subtotal + extra_total,
    2
  );

  delete from public.business_purchase_items
  where purchase_order_id = purchase_row.id
    and user_id = current_user_id
    and workspace_id = purchase_row.workspace_id;

  update public.business_purchase_orders
  set purchase_date = coalesce(
        p_purchase_date,
        purchase_date
      ),
      expected_arrival_date = case
        when p_clear_expected_arrival_date then null
        when p_expected_arrival_date is not null
          then p_expected_arrival_date
        else expected_arrival_date
      end,
      origin = case
        when p_clear_origin then null
        when p_origin is not null
          then nullif(trim(p_origin), '')
        else origin
      end,
      product_subtotal = next_product_subtotal,
      shipping_cost = shipping_cost_value,
      additional_costs = additional_costs_value,
      total_cost = next_total_cost,
      notes = case
        when p_clear_notes then null
        when p_notes is not null
          then nullif(trim(p_notes), '')
        else notes
      end
  where id = purchase_row.id;

  for item_payload in
    select value
    from jsonb_array_elements(p_items)
  loop
    item_index := item_index + 1;

    quantity_value :=
      (item_payload->>'quantity')::integer;

    unit_cost_value := round((item_payload->>'unit_purchase_cost')::numeric, 6);

    product_id_value :=
      nullif(item_payload->>'product_id', '')::uuid;

    if product_id_value is null then
      product_name_value :=
        trim(item_payload->>'product_name');

      product_sku_value := nullif(
        trim(item_payload->>'product_sku'),
        ''
      );

      category_id_value := public.business_resolve_product_category(
        purchase_row.workspace_id,
        current_user_id,
        nullif(item_payload->>'product_category_id', '')::uuid,
        nullif(trim(item_payload->>'product_category_name'), '')
      );

      default_sale_price_value :=
        nullif(item_payload->>'default_sale_price', '')::numeric;

      minimum_stock_value := coalesce(
        nullif(item_payload->>'minimum_stock', '')::integer,
        0
      );

      if product_sku_value is not null then
        perform pg_advisory_xact_lock(
          hashtextextended(
            purchase_row.workspace_id::text
            || ':product_sku:'
            || lower(product_sku_value),
            0
          )
        );

        if exists (
          select 1
          from public.business_products
          where user_id = current_user_id
            and workspace_id = purchase_row.workspace_id
            and lower(trim(sku)) = lower(product_sku_value)
        ) then
          raise exception 'SKU ja cadastrado neste negocio';
        end if;
      end if;

      insert into public.business_products (
        user_id,
        workspace_id,
        name,
        sku,
        category_id,
        default_sale_price,
        minimum_stock
      )
      values (
        current_user_id,
        purchase_row.workspace_id,
        product_name_value,
        product_sku_value,
        category_id_value,
        case
          when default_sale_price_value is null
            then null
          else round(default_sale_price_value, 2)
        end,
        minimum_stock_value
      )
      returning id into product_id_value;
    end if;

    line_subtotal := round(
      quantity_value * unit_cost_value,
      2
    );

    if item_index = item_count then
      allocated_extra := round(
        extra_total - allocated_so_far,
        2
      );
    elsif extra_total = 0 then
      allocated_extra := 0;
    elsif next_product_subtotal > 0 then
      allocated_extra := round(
        extra_total
        * line_subtotal
        / next_product_subtotal,
        2
      );
    else
      allocated_extra := round(
        extra_total
        * quantity_value
        / total_quantity,
        2
      );
    end if;

    allocated_so_far := round(
      allocated_so_far + allocated_extra,
      2
    );

    real_unit_cost := round(
      (
        line_subtotal
        + allocated_extra
      ) / quantity_value,
      2
    );

    insert into public.business_purchase_items (
      user_id,
      workspace_id,
      purchase_order_id,
      product_id,
      quantity_ordered,
      quantity_received,
      unit_purchase_cost,
      allocated_extra_cost,
      real_unit_cost
    )
    values (
      current_user_id,
      purchase_row.workspace_id,
      purchase_row.id,
      product_id_value,
      quantity_value,
      0,
      unit_cost_value,
      allocated_extra,
      real_unit_cost
    )
    returning id into purchase_item_id;

    response_items :=
      response_items || jsonb_build_array(
        jsonb_build_object(
          'purchase_item_id', purchase_item_id,
          'product_id', product_id_value,
          'quantity_ordered', quantity_value,
          'unit_purchase_cost', unit_cost_value,
          'allocated_extra_cost', allocated_extra,
          'real_unit_cost', real_unit_cost
        )
      );
  end loop;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    purchase_row.workspace_id,
    'purchase_order',
    purchase_row.id,
    'purchase_updated',
    jsonb_build_object(
      'status', purchase_row.status,
      'item_count', item_count,
      'quantity', total_quantity,
      'product_subtotal', next_product_subtotal,
      'shipping_cost', shipping_cost_value,
      'additional_costs', additional_costs_value,
      'total_cost', next_total_cost
    )
  );

  response := jsonb_build_object(
    'purchase_order_id', purchase_row.id,
    'status', purchase_row.status,
    'item_count', item_count,
    'quantity_ordered', total_quantity,
    'product_subtotal', next_product_subtotal,
    'shipping_cost', shipping_cost_value,
    'additional_costs', additional_costs_value,
    'total_cost', next_total_cost,
    'items', response_items
  );

  perform public.business_complete_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'update_business_purchase_multi',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

revoke execute on function public.create_business_purchase_multi(
  uuid,
  jsonb,
  text,
  numeric,
  numeric,
  date,
  date,
  text,
  text
) from public, anon;

grant execute on function public.create_business_purchase_multi(
  uuid,
  jsonb,
  text,
  numeric,
  numeric,
  date,
  date,
  text,
  text
) to authenticated;

revoke execute on function public.update_business_purchase_multi(
  uuid,
  jsonb,
  text,
  numeric,
  numeric,
  date,
  date,
  text,
  text,
  boolean,
  boolean,
  boolean
) from public, anon;

grant execute on function public.update_business_purchase_multi(
  uuid,
  jsonb,
  text,
  numeric,
  numeric,
  date,
  date,
  text,
  text,
  boolean,
  boolean,
  boolean
) to authenticated;
