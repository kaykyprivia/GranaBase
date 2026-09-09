-- Business inventory module support.
-- Inventory remains a projection of lots, movements, reservations and purchases.

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
left join (
  select
    user_id,
    workspace_id,
    product_id,
    max(created_at) as last_movement_at
  from public.business_inventory_movements
  group by user_id, workspace_id, product_id
) movement_stats on movement_stats.product_id = product.id
  and movement_stats.user_id = product.user_id
  and movement_stats.workspace_id = product.workspace_id
left join (
  select
    user_id,
    workspace_id,
    product_id,
    sum(quantity_ordered) as total_purchased,
    sum(quantity_received) as total_received
  from public.business_purchase_items
  group by user_id, workspace_id, product_id
) purchase_stats on purchase_stats.product_id = product.id
  and purchase_stats.user_id = product.user_id
  and purchase_stats.workspace_id = product.workspace_id
left join (
  select
    user_id,
    workspace_id,
    product_id,
    sum(abs(quantity_delta)) as total_sold
  from public.business_inventory_movements
  where movement_type = 'SALE_OUT'
  group by user_id, workspace_id, product_id
) sale_stats on sale_stats.product_id = product.id
  and sale_stats.user_id = product.user_id
  and sale_stats.workspace_id = product.workspace_id
where
  product.active = true
  or coalesce(stock.on_hand, 0) > 0
  or coalesce(in_transit.quantity, 0) > 0
  or movement_stats.last_movement_at is not null
  or coalesce(purchase_stats.total_purchased, 0) > 0;

grant select on public.business_inventory_summary to authenticated;

create or replace function public.adjust_business_inventory(
  p_workspace_id uuid,
  p_product_id uuid,
  p_quantity_delta integer,
  p_movement_type text,
  p_reason text,
  p_idempotency_key text,
  p_unit_cost numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  remaining_to_adjust integer;
  adjust_quantity integer;
  lot_row public.business_inventory_lots%rowtype;
  lot_id uuid;
  request_hash text;
  existing_response jsonb;
  response jsonb;
  adjusted_quantity integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  request_hash := md5(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'product_id', p_product_id,
    'quantity_delta', p_quantity_delta,
    'movement_type', p_movement_type,
    'reason', p_reason,
    'unit_cost', p_unit_cost
  )::text);
  existing_response := public.business_claim_idempotency(current_user_id, p_workspace_id, 'adjust_business_inventory', p_idempotency_key, request_hash);
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
  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Ajuste precisa ter quantidade diferente de zero';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Motivo do ajuste e obrigatorio';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Custo unitario nao pode ser negativo';
  end if;

  if p_movement_type is null then
    raise exception 'Tipo de movimento e obrigatorio';
  end if;
  if p_quantity_delta > 0 and p_movement_type <> 'ADJUSTMENT_IN' then
    raise exception 'Ajuste positivo precisa ser ADJUSTMENT_IN';
  end if;
  if p_quantity_delta > 0 and (p_unit_cost is null or p_unit_cost <= 0) then
    raise exception 'Custo unitario positivo e obrigatorio para entrada manual';
  end if;
  if p_quantity_delta < 0 and p_movement_type not in ('ADJUSTMENT_OUT', 'LOSS', 'DAMAGED') then
    raise exception 'Ajuste negativo precisa ser ADJUSTMENT_OUT, LOSS ou DAMAGED';
  end if;

  if p_quantity_delta > 0 then
    insert into public.business_inventory_lots (
      user_id,
      workspace_id,
      product_id,
      purchase_item_id,
      received_quantity,
      remaining_quantity,
      unit_cost
    )
    values (
      current_user_id,
      p_workspace_id,
      p_product_id,
      null,
      p_quantity_delta,
      p_quantity_delta,
      round(p_unit_cost, 6)
    )
    returning id into lot_id;

    insert into public.business_inventory_movements (
      user_id,
      workspace_id,
      product_id,
      inventory_lot_id,
      movement_type,
      quantity_delta,
      unit_cost,
      total_cost,
      reference_type,
      reference_id,
      notes
    )
    values (
      current_user_id,
      p_workspace_id,
      p_product_id,
      lot_id,
      'ADJUSTMENT_IN',
      p_quantity_delta,
      round(p_unit_cost, 6),
      round(p_quantity_delta * p_unit_cost, 2),
      'inventory_adjustment',
      lot_id,
      nullif(trim(p_reason), '')
    );

    adjusted_quantity := p_quantity_delta;
  else
    remaining_to_adjust := abs(p_quantity_delta);

    for lot_row in
      select *
      from public.business_inventory_lots
      where user_id = current_user_id
        and workspace_id = p_workspace_id
        and product_id = p_product_id
        and remaining_quantity - reserved_quantity > 0
      order by received_at, id
      for update
    loop
      exit when remaining_to_adjust <= 0;
      adjust_quantity := least(remaining_to_adjust, lot_row.remaining_quantity - lot_row.reserved_quantity);

      update public.business_inventory_lots
      set remaining_quantity = remaining_quantity - adjust_quantity
      where id = lot_row.id;

      insert into public.business_inventory_movements (
        user_id,
        workspace_id,
        product_id,
        inventory_lot_id,
        movement_type,
        quantity_delta,
        unit_cost,
        total_cost,
        reference_type,
        reference_id,
        notes
      )
      values (
        current_user_id,
        p_workspace_id,
        p_product_id,
        lot_row.id,
        p_movement_type,
        -adjust_quantity,
        lot_row.unit_cost,
        round(adjust_quantity * lot_row.unit_cost, 2),
        'inventory_adjustment',
        lot_row.id,
        nullif(trim(p_reason), '')
      );

      remaining_to_adjust := remaining_to_adjust - adjust_quantity;
      adjusted_quantity := adjusted_quantity + adjust_quantity;
    end loop;

    if remaining_to_adjust > 0 then
      raise exception 'Ajuste deixaria estoque disponivel negativo';
    end if;
  end if;

  perform public.business_log_audit(current_user_id, current_user_id, p_workspace_id, 'product', p_product_id, 'inventory_adjusted', jsonb_build_object('quantity_delta', p_quantity_delta, 'movement_type', p_movement_type, 'reason', nullif(trim(p_reason), '')));

  response := jsonb_build_object('product_id', p_product_id, 'adjusted_quantity', adjusted_quantity, 'movement_type', p_movement_type);
  perform public.business_complete_idempotency(current_user_id, p_workspace_id, 'adjust_business_inventory', p_idempotency_key, response);
  return response;
end;
$$;

create or replace function public.update_business_product_metadata(
  p_workspace_id uuid,
  p_product_id uuid,
  p_idempotency_key text,
  p_name text,
  p_sku text default null,
  p_default_sale_price numeric default null,
  p_minimum_stock integer default 0,
  p_active boolean default true
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
    'active', p_active
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
    'default_sale_price', case when p_default_sale_price is null then null else round(p_default_sale_price, 2) end,
    'minimum_stock', p_minimum_stock,
    'active', coalesce(p_active, true)
  ));

  response := jsonb_build_object('product_id', p_product_id);
  perform public.business_complete_idempotency(current_user_id, p_workspace_id, 'update_business_product_metadata', p_idempotency_key, response);
  return response;
end;
$$;

revoke execute on function public.adjust_business_inventory(uuid, uuid, integer, text, text, text, numeric) from public, anon;
revoke execute on function public.update_business_product_metadata(uuid, uuid, text, text, text, numeric, integer, boolean) from public, anon;

grant execute on function public.adjust_business_inventory(uuid, uuid, integer, text, text, text, numeric) to authenticated;
grant execute on function public.update_business_product_metadata(uuid, uuid, text, text, text, numeric, integer, boolean) to authenticated;
