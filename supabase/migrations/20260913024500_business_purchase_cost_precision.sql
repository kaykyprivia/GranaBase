-- Business purchases V2: preserve fractional unit-cost precision.
-- Monetary totals remain rounded to cents; internal FIFO/unit costs retain 6 decimals.

drop view if exists public.business_inventory_summary;

alter table public.business_purchase_items
  alter column unit_purchase_cost type numeric(18,6),
  alter column real_unit_cost type numeric(18,6);

alter table public.business_inventory_lots
  alter column unit_cost type numeric(18,6);

alter table public.business_sale_item_allocations
  alter column unit_cost type numeric(18,6);

alter table public.business_inventory_movements
  alter column unit_cost type numeric(18,6);

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

  --
  -- First pass:
  -- validate every line before writing the purchase.
  --
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

  --
  -- Second pass:
  -- create inline products when needed and persist every purchase item.
  -- Freight and additional costs are allocated proportionally.
  --
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
        default_sale_price,
        minimum_stock
      )
      values (
        current_user_id,
        p_workspace_id,
        product_name_value,
        product_sku_value,
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

  --
  -- First pass: validate everything and calculate canonical totals.
  -- Unit purchase cost is normalized to cents before subtotal calculation,
  -- so persisted line cost and order subtotal cannot diverge by rounding.
  --
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

  --
  -- No stock exists yet, therefore replacing purchase lines is safe.
  --
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

  --
  -- Second pass: create inline products when necessary,
  -- recreate every purchase line and allocate extras deterministically.
  --
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
        default_sale_price,
        minimum_stock
      )
      values (
        current_user_id,
        purchase_row.workspace_id,
        product_name_value,
        product_sku_value,
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
  uuid, jsonb, text, numeric, numeric, date, date, text, text
) from public, anon;

grant execute on function public.create_business_purchase_multi(
  uuid, jsonb, text, numeric, numeric, date, date, text, text
) to authenticated;

revoke execute on function public.update_business_purchase_multi(
  uuid, jsonb, text, numeric, numeric, date, date, text, text, boolean, boolean, boolean
) from public, anon;

grant execute on function public.update_business_purchase_multi(
  uuid, jsonb, text, numeric, numeric, date, date, text, text, boolean, boolean, boolean
) to authenticated;
