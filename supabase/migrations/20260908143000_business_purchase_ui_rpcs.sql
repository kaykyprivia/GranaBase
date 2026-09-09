-- Business purchases UI support RPCs.
-- Adds safe workspace bootstrap and purchase cancellation without opening direct table writes.

drop view if exists public.business_inventory_summary;

alter table public.business_purchase_items
  alter column real_unit_cost type numeric(14,6);

alter table public.business_inventory_lots
  alter column unit_cost type numeric(14,6);

alter table public.business_sale_item_allocations
  alter column unit_cost type numeric(14,6);

alter table public.business_inventory_movements
  alter column unit_cost type numeric(14,6);

create unique index if not exists uq_business_products_workspace_sku_lower_active
  on public.business_products(workspace_id, lower(trim(sku)))
  where sku is not null and active = true;

create or replace view public.business_inventory_summary
with (security_invoker = true)
as
select
  product.id as product_id,
  product.user_id,
  product.workspace_id,
  product.name,
  product.sku,
  product.default_sale_price,
  product.minimum_stock,
  coalesce(stock.on_hand, 0)::integer as on_hand,
  coalesce(stock.reserved, 0)::integer as reserved,
  greatest(coalesce(stock.on_hand, 0) - coalesce(stock.reserved, 0), 0)::integer as available,
  coalesce(stock.inventory_value, 0)::numeric(12,2) as inventory_value,
  case
    when coalesce(stock.on_hand, 0) > 0 then round(stock.inventory_value / stock.on_hand, 2)
    else 0
  end::numeric(12,2) as average_unit_cost,
  case
    when product.default_sale_price is not null and coalesce(stock.on_hand, 0) > 0 then
      round((product.default_sale_price * coalesce(stock.on_hand, 0)) - stock.inventory_value, 2)
    else 0
  end::numeric(12,2) as estimated_profit
from public.business_products product
left join (
  select
    user_id,
    workspace_id,
    product_id,
    sum(remaining_quantity) as on_hand,
    sum(reserved_quantity) as reserved,
    sum(remaining_quantity * unit_cost) as inventory_value
  from public.business_inventory_lots
  group by user_id, workspace_id, product_id
) stock on stock.product_id = product.id
  and stock.user_id = product.user_id
  and stock.workspace_id = product.workspace_id
left join (
  select
    item.user_id,
    item.workspace_id,
    item.product_id,
    sum(item.quantity_ordered - item.quantity_received) as quantity
  from public.business_purchase_items item
  join public.business_purchase_orders po
    on po.id = item.purchase_order_id
    and po.user_id = item.user_id
    and po.workspace_id = item.workspace_id
  where po.status in ('PURCHASED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')
  group by item.user_id, item.workspace_id, item.product_id
) in_transit on in_transit.product_id = product.id
  and in_transit.user_id = product.user_id
  and in_transit.workspace_id = product.workspace_id
where product.active = true;

grant select on public.business_inventory_summary to authenticated;

create or replace function public.create_business_purchase(
  p_workspace_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_purchase_cost numeric,
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
  product_subtotal numeric(12,2);
  total_cost numeric(12,2);
  real_unit_cost numeric(14,6);
  purchase_id uuid;
  purchase_item_id uuid;
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
    'quantity', p_quantity,
    'unit_purchase_cost', p_unit_purchase_cost,
    'shipping_cost', p_shipping_cost,
    'additional_costs', p_additional_costs,
    'purchase_date', p_purchase_date,
    'expected_arrival_date', p_expected_arrival_date,
    'origin', p_origin,
    'notes', p_notes
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_purchase',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  if not exists (
    select 1 from public.business_products
    where id = p_product_id
      and user_id = current_user_id
      and workspace_id = p_workspace_id
      and active = true
  ) then
    raise exception 'Produto nao encontrado';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser positiva';
  end if;
  if p_unit_purchase_cost is null or p_unit_purchase_cost < 0 or p_shipping_cost < 0 or p_additional_costs < 0 then
    raise exception 'Valores de compra nao podem ser negativos';
  end if;

  product_subtotal := round(p_quantity * p_unit_purchase_cost, 2);
  total_cost := round(product_subtotal + coalesce(p_shipping_cost, 0) + coalesce(p_additional_costs, 0), 2);
  real_unit_cost := round(total_cost / p_quantity, 6);

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
    round(coalesce(p_shipping_cost, 0), 2),
    round(coalesce(p_additional_costs, 0), 2),
    total_cost,
    'PURCHASED',
    nullif(trim(p_notes), '')
  )
  returning id into purchase_id;

  insert into public.business_purchase_items (
    user_id,
    workspace_id,
    purchase_order_id,
    product_id,
    quantity_ordered,
    unit_purchase_cost,
    allocated_extra_cost,
    real_unit_cost
  )
  values (
    current_user_id,
    p_workspace_id,
    purchase_id,
    p_product_id,
    p_quantity,
    round(p_unit_purchase_cost, 2),
    round(coalesce(p_shipping_cost, 0) + coalesce(p_additional_costs, 0), 2),
    real_unit_cost
  )
  returning id into purchase_item_id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    p_workspace_id,
    'purchase_order',
    purchase_id,
    'purchase_created',
    jsonb_build_object('quantity', p_quantity, 'total_cost', total_cost)
  );

  response := jsonb_build_object(
    'purchase_order_id', purchase_id,
    'purchase_item_id', purchase_item_id,
    'status', 'PURCHASED',
    'total_cost', total_cost,
    'real_unit_cost', real_unit_cost
  );

  perform public.business_complete_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_purchase',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

create or replace function public.get_or_create_business_workspace(
  p_name text default 'Meu negócio'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  workspace_row public.business_workspaces%rowtype;
  workspace_name text := coalesce(nullif(trim(p_name), ''), 'Meu negócio');
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select *
    into workspace_row
  from public.business_workspaces
  where user_id = current_user_id
  order by created_at, id
  limit 1;

  if not found then
    insert into public.business_workspaces (user_id, name)
    values (current_user_id, workspace_name)
    returning * into workspace_row;
  end if;

  return jsonb_build_object(
    'workspace_id', workspace_row.id,
    'name', workspace_row.name
  );
end;
$$;

create or replace function public.cancel_business_purchase(
  p_purchase_order_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  purchase_row public.business_purchase_orders%rowtype;
  received_quantity integer;
  request_hash text;
  existing_response jsonb;
  response jsonb;
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

  request_hash := md5(jsonb_build_object('purchase_order_id', p_purchase_order_id)::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'cancel_business_purchase',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  select coalesce(sum(quantity_received), 0)
    into received_quantity
  from public.business_purchase_items
  where purchase_order_id = purchase_row.id
    and user_id = current_user_id
    and workspace_id = purchase_row.workspace_id;

  if purchase_row.status = 'CANCELLED' then
    raise exception 'Compra ja cancelada';
  end if;

  if purchase_row.status = 'RECEIVED' or received_quantity > 0 then
    raise exception 'Compra com recebimento nao pode ser cancelada';
  end if;

  update public.business_purchase_orders
  set status = 'CANCELLED'
  where id = purchase_row.id
    and user_id = current_user_id
    and workspace_id = purchase_row.workspace_id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    purchase_row.workspace_id,
    'purchase_order',
    purchase_row.id,
    'purchase_cancelled',
    jsonb_build_object('previous_status', purchase_row.status)
  );

  response := jsonb_build_object(
    'purchase_order_id', purchase_row.id,
    'status', 'CANCELLED'
  );

  perform public.business_complete_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'cancel_business_purchase',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

create or replace function public.create_business_product_and_purchase(
  p_workspace_id uuid,
  p_product_name text,
  p_quantity integer,
  p_unit_purchase_cost numeric,
  p_idempotency_key text,
  p_product_sku text default null,
  p_default_sale_price numeric default null,
  p_minimum_stock integer default 0,
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
  product_id uuid;
  request_hash text;
  existing_response jsonb;
  purchase_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  request_hash := md5(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'product_name', p_product_name,
    'product_sku', p_product_sku,
    'default_sale_price', p_default_sale_price,
    'minimum_stock', p_minimum_stock,
    'quantity', p_quantity,
    'unit_purchase_cost', p_unit_purchase_cost,
    'shipping_cost', p_shipping_cost,
    'additional_costs', p_additional_costs,
    'purchase_date', p_purchase_date,
    'expected_arrival_date', p_expected_arrival_date,
    'origin', p_origin,
    'notes', p_notes
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_product_and_purchase',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  if nullif(trim(p_product_name), '') is null then
    raise exception 'Nome do produto e obrigatorio';
  end if;
  if p_minimum_stock is null or p_minimum_stock < 0 then
    raise exception 'Estoque minimo nao pode ser negativo';
  end if;
  if p_default_sale_price is not null and p_default_sale_price < 0 then
    raise exception 'Preco de venda nao pode ser negativo';
  end if;
  if nullif(trim(p_product_sku), '') is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_workspace_id::text || ':product_sku:' || lower(trim(p_product_sku)), 0)
    );

    if exists (
      select 1
      from public.business_products
      where user_id = current_user_id
        and workspace_id = p_workspace_id
        and active = true
        and lower(trim(sku)) = lower(trim(p_product_sku))
    ) then
      raise exception 'SKU ja cadastrado neste negocio';
    end if;
  end if;

  insert into public.business_products (
    user_id,
    workspace_id,
    name,
    sku,
    default_sale_price,
    minimum_stock
  )
  values (
    current_user_id,
    p_workspace_id,
    trim(p_product_name),
    nullif(trim(p_product_sku), ''),
    case when p_default_sale_price is null then null else round(p_default_sale_price, 2) end,
    p_minimum_stock
  )
  returning id into product_id;

  purchase_response := public.create_business_purchase(
    p_workspace_id,
    product_id,
    p_quantity,
    p_unit_purchase_cost,
    p_idempotency_key || ':purchase',
    p_shipping_cost,
    p_additional_costs,
    p_purchase_date,
    p_expected_arrival_date,
    p_origin,
    p_notes
  );

  response := purchase_response || jsonb_build_object('product_id', product_id);

  perform public.business_complete_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_product_and_purchase',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

drop function if exists public.update_business_purchase(uuid, text, integer, numeric, numeric, numeric, date, date, text, text);

create or replace function public.update_business_purchase(
  p_purchase_order_id uuid,
  p_idempotency_key text,
  p_quantity integer default null,
  p_unit_purchase_cost numeric default null,
  p_shipping_cost numeric default null,
  p_additional_costs numeric default null,
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
  item_row public.business_purchase_items%rowtype;
  next_quantity integer;
  next_unit_cost numeric;
  next_item_unit_cost numeric(12,2);
  next_shipping numeric(12,2);
  next_additional numeric(12,2);
  next_product_subtotal numeric(12,2);
  next_total_cost numeric(12,2);
  next_real_unit_cost numeric(14,6);
  request_hash text;
  existing_response jsonb;
  response jsonb;
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

  request_hash := md5(jsonb_build_object(
    'purchase_order_id', p_purchase_order_id,
    'quantity', p_quantity,
    'unit_purchase_cost', p_unit_purchase_cost,
    'shipping_cost', p_shipping_cost,
    'additional_costs', p_additional_costs,
    'purchase_date', p_purchase_date,
    'expected_arrival_date', p_expected_arrival_date,
    'origin', p_origin,
    'notes', p_notes,
    'clear_expected_arrival_date', p_clear_expected_arrival_date,
    'clear_origin', p_clear_origin,
    'clear_notes', p_clear_notes,
    'current_status', purchase_row.status
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'update_business_purchase',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  select *
    into item_row
  from public.business_purchase_items
  where purchase_order_id = purchase_row.id
    and user_id = current_user_id
    and workspace_id = purchase_row.workspace_id
  order by created_at, id
  limit 1
  for update;

  if not found then
    raise exception 'Compra sem item';
  end if;

  next_quantity := coalesce(p_quantity, item_row.quantity_ordered);
  next_unit_cost := coalesce(
    p_unit_purchase_cost,
    purchase_row.product_subtotal / nullif(item_row.quantity_ordered, 0),
    item_row.unit_purchase_cost
  );
  next_item_unit_cost := round(next_unit_cost, 2);
  next_shipping := round(coalesce(p_shipping_cost, purchase_row.shipping_cost), 2);
  next_additional := round(coalesce(p_additional_costs, purchase_row.additional_costs), 2);

  if next_quantity <= 0 or next_unit_cost < 0 or next_shipping < 0 or next_additional < 0 then
    raise exception 'Valores de compra invalidos';
  end if;

  if purchase_row.status = 'RECEIVED' and (
    p_quantity is not null or p_unit_purchase_cost is not null or p_shipping_cost is not null or
    p_additional_costs is not null or p_purchase_date is not null
  ) then
    raise exception 'Compra recebida nao permite alterar dados financeiros ou quantidade';
  end if;

  if purchase_row.status = 'PARTIALLY_RECEIVED' then
    if p_quantity is not null and p_quantity <> item_row.quantity_ordered then
      raise exception 'Compra parcialmente recebida nao permite alterar quantidade';
    end if;
    if next_quantity < item_row.quantity_received then
      raise exception 'Quantidade nao pode ficar menor que a ja recebida';
    end if;
    if p_unit_purchase_cost is not null or p_shipping_cost is not null or p_additional_costs is not null or p_purchase_date is not null then
      raise exception 'Compra parcialmente recebida nao permite alterar custos historicos';
    end if;
  end if;

  if purchase_row.status = 'CANCELLED' then
    raise exception 'Compra cancelada nao pode ser editada';
  end if;

  next_product_subtotal := round(next_quantity * next_unit_cost, 2);
  next_total_cost := round(next_product_subtotal + next_shipping + next_additional, 2);
  next_real_unit_cost := round(next_total_cost / next_quantity, 6);

  update public.business_purchase_orders
  set purchase_date = coalesce(p_purchase_date, purchase_date),
      expected_arrival_date = case
        when p_clear_expected_arrival_date then null
        when p_expected_arrival_date is not null then p_expected_arrival_date
        else expected_arrival_date
      end,
      origin = case
        when p_clear_origin then null
        when p_origin is not null then nullif(trim(p_origin), '')
        else origin
      end,
      product_subtotal = case when status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_product_subtotal else product_subtotal end,
      shipping_cost = case when status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_shipping else shipping_cost end,
      additional_costs = case when status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_additional else additional_costs end,
      total_cost = case when status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_total_cost else total_cost end,
      notes = case
        when p_clear_notes then null
        when p_notes is not null then nullif(trim(p_notes), '')
        else notes
      end
  where id = purchase_row.id;

  update public.business_purchase_items
  set quantity_ordered = case when purchase_row.status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_quantity else quantity_ordered end,
      unit_purchase_cost = case when purchase_row.status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_item_unit_cost else unit_purchase_cost end,
      allocated_extra_cost = case when purchase_row.status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_shipping + next_additional else allocated_extra_cost end,
      real_unit_cost = case when purchase_row.status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_real_unit_cost else real_unit_cost end
  where id = item_row.id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    purchase_row.workspace_id,
    'purchase_order',
    purchase_row.id,
    'purchase_updated',
    jsonb_build_object('status', purchase_row.status, 'quantity', next_quantity)
  );

  response := jsonb_build_object(
    'purchase_order_id', purchase_row.id,
    'status', purchase_row.status,
    'quantity_ordered', next_quantity,
    'total_cost', case when purchase_row.status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_total_cost else purchase_row.total_cost end
  );

  perform public.business_complete_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'update_business_purchase',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

revoke execute on function public.get_or_create_business_workspace(text) from public, anon;
revoke execute on function public.cancel_business_purchase(uuid, text) from public, anon;
revoke execute on function public.create_business_product_and_purchase(uuid, text, integer, numeric, text, text, numeric, integer, numeric, numeric, date, date, text, text) from public, anon;
revoke execute on function public.update_business_purchase(uuid, text, integer, numeric, numeric, numeric, date, date, text, text, boolean, boolean, boolean) from public, anon;

grant execute on function public.get_or_create_business_workspace(text) to authenticated;
grant execute on function public.cancel_business_purchase(uuid, text) to authenticated;
grant execute on function public.create_business_product_and_purchase(uuid, text, integer, numeric, text, text, numeric, integer, numeric, numeric, date, date, text, text) to authenticated;
grant execute on function public.update_business_purchase(uuid, text, integer, numeric, numeric, numeric, date, date, text, text, boolean, boolean, boolean) to authenticated;
