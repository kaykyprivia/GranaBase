-- Business purchases V2: multi-item atomic creation and item-aware receiving.
-- Legacy purchase RPCs remain available until the UI migration is complete.

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
  unit_cost_value numeric;
  line_subtotal numeric(12,2);
  product_subtotal numeric(12,2) := 0;
  total_quantity integer := 0;
  shipping_cost_value numeric(12,2);
  additional_costs_value numeric(12,2);
  extra_total numeric(12,2);
  total_cost numeric(12,2);
  allocated_extra numeric(12,2);
  allocated_so_far numeric(12,2) := 0;
  real_unit_cost numeric(14,6);
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
    unit_cost_value := nullif(item_payload->>'unit_purchase_cost', '')::numeric;

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
    unit_cost_value := (item_payload->>'unit_purchase_cost')::numeric;
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
      round(unit_cost_value, 2),
      allocated_extra,
      real_unit_cost
    )
    returning id into purchase_item_id;

    response_items := response_items || jsonb_build_array(
      jsonb_build_object(
        'purchase_item_id', purchase_item_id,
        'product_id', product_id_value,
        'quantity_ordered', quantity_value,
        'unit_purchase_cost', round(unit_cost_value, 2),
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


create or replace function public.receive_business_purchase_items(
  p_purchase_order_id uuid,
  p_items jsonb,
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
  purchase_item_row public.business_purchase_items%rowtype;
  item_payload jsonb;
  purchase_item_id_value uuid;
  quantity_value integer;
  item_count integer;
  received_count integer := 0;
  still_pending integer;
  lot_id uuid;
  seen_item_ids uuid[] := array[]::uuid[];
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
    'PURCHASED',
    'IN_TRANSIT',
    'PARTIALLY_RECEIVED'
  ) then
    raise exception 'Compra nao pode ser recebida no status atual';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe pelo menos um item para receber';
  end if;

  item_count := jsonb_array_length(p_items);

  if item_count > 100 then
    raise exception 'Recebimento excede o limite de 100 itens';
  end if;

  request_hash := md5(
    jsonb_build_object(
      'purchase_order_id', p_purchase_order_id,
      'items', p_items
    )::text
  );

  existing_response := public.business_claim_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'receive_business_purchase_items',
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
      raise exception 'Item de recebimento invalido';
    end if;

    purchase_item_id_value :=
      nullif(item_payload->>'purchase_item_id', '')::uuid;

    quantity_value :=
      nullif(item_payload->>'quantity', '')::integer;

    if purchase_item_id_value is null then
      raise exception 'Item da compra nao informado';
    end if;

    if quantity_value is null or quantity_value <= 0 then
      raise exception 'Quantidade recebida deve ser positiva';
    end if;

    if purchase_item_id_value = any(seen_item_ids) then
      raise exception 'O mesmo item nao pode ser recebido duas vezes na mesma operacao';
    end if;

    seen_item_ids := array_append(
      seen_item_ids,
      purchase_item_id_value
    );

    select *
      into purchase_item_row
    from public.business_purchase_items
    where id = purchase_item_id_value
      and purchase_order_id = purchase_row.id
      and user_id = current_user_id
      and workspace_id = purchase_row.workspace_id
    for update;

    if not found then
      raise exception 'Item da compra nao encontrado';
    end if;

    if quantity_value >
       (
         purchase_item_row.quantity_ordered
         - purchase_item_row.quantity_received
       ) then
      raise exception 'Quantidade recebida maior que o saldo pendente do item';
    end if;

    update public.business_purchase_items
    set quantity_received =
      quantity_received + quantity_value
    where id = purchase_item_row.id;

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
      purchase_row.workspace_id,
      purchase_item_row.product_id,
      purchase_item_row.id,
      quantity_value,
      quantity_value,
      purchase_item_row.real_unit_cost
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
      reference_id
    )
    values (
      current_user_id,
      purchase_row.workspace_id,
      purchase_item_row.product_id,
      lot_id,
      'PURCHASE_RECEIPT',
      quantity_value,
      purchase_item_row.real_unit_cost,
      round(
        quantity_value
        * purchase_item_row.real_unit_cost,
        2
      ),
      'purchase_order',
      purchase_row.id
    );

    received_count := received_count + quantity_value;

    response_items := response_items || jsonb_build_array(
      jsonb_build_object(
        'purchase_item_id', purchase_item_row.id,
        'product_id', purchase_item_row.product_id,
        'received_quantity', quantity_value,
        'quantity_received_total',
          purchase_item_row.quantity_received + quantity_value,
        'quantity_remaining',
          purchase_item_row.quantity_ordered
          - purchase_item_row.quantity_received
          - quantity_value
      )
    );
  end loop;

  select coalesce(
    sum(quantity_ordered - quantity_received),
    0
  )
    into still_pending
  from public.business_purchase_items
  where purchase_order_id = purchase_row.id
    and user_id = current_user_id
    and workspace_id = purchase_row.workspace_id;

  update public.business_purchase_orders
  set status = case
    when still_pending = 0 then 'RECEIVED'
    else 'PARTIALLY_RECEIVED'
  end
  where id = purchase_row.id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    purchase_row.workspace_id,
    'purchase_order',
    purchase_row.id,
    'purchase_received',
    jsonb_build_object(
      'received_quantity', received_count,
      'remaining_quantity', still_pending,
      'items', response_items
    )
  );

  response := jsonb_build_object(
    'purchase_order_id', purchase_row.id,
    'received_quantity', received_count,
    'remaining_quantity', still_pending,
    'status', case
      when still_pending = 0 then 'RECEIVED'
      else 'PARTIALLY_RECEIVED'
    end,
    'items', response_items
  );

  perform public.business_complete_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'receive_business_purchase_items',
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

revoke execute on function public.receive_business_purchase_items(
  uuid,
  jsonb,
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

grant execute on function public.receive_business_purchase_items(
  uuid,
  jsonb,
  text
) to authenticated;
