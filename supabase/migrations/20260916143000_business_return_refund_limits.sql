create or replace function public.return_business_sale(
  p_sale_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_refund_amount numeric default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_row public.business_sales%rowtype;
  return_id uuid;
  item_payload jsonb;
  sale_item_row public.business_sale_items%rowtype;
  allocation_row record;
  requested_quantity integer;
  remaining_quantity integer;
  alloc_return_quantity integer;
  restockable boolean;
  already_returned integer;
  total_returned integer := 0;
  total_sale_quantity integer;
  total_returned_all_time integer;
  current_return_value numeric(12,2) := 0;
  max_refund_amount numeric(12,2) := 0;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into sale_row
  from public.business_sales
  where id = p_sale_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada';
  end if;

  request_hash := md5(jsonb_build_object(
    'sale_id', p_sale_id,
    'items', p_items,
    'refund_amount', p_refund_amount,
    'notes', p_notes
  )::text);
  existing_response := public.business_claim_idempotency(current_user_id, sale_row.workspace_id, 'return_business_sale', p_idempotency_key, request_hash);
  if existing_response is not null then
    return existing_response;
  end if;

  if sale_row.order_status not in ('DELIVERED', 'RETURNED') then
    raise exception 'Somente venda entregue pode receber devolucao';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Devolucao precisa receber uma lista de itens';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Devolucao precisa ter ao menos um item';
  end if;
  if p_refund_amount < 0 then
    raise exception 'Valor devolvido nao pode ser negativo';
  end if;

  insert into public.business_sale_returns (user_id, workspace_id, sale_id, refund_amount, notes)
  values (current_user_id, sale_row.workspace_id, sale_row.id, round(coalesce(p_refund_amount, 0), 2), nullif(trim(p_notes), ''))
  returning id into return_id;

  for item_payload in select * from jsonb_array_elements(p_items)
  loop
    select *
      into sale_item_row
    from public.business_sale_items
    where id = (item_payload->>'sale_item_id')::uuid
      and sale_id = sale_row.id
      and user_id = current_user_id
      and workspace_id = sale_row.workspace_id
    for update;

    if not found then
      raise exception 'Item de venda nao encontrado para devolucao';
    end if;

    requested_quantity := (item_payload->>'quantity')::integer;
    restockable := coalesce((item_payload->>'restockable')::boolean, true);
    if requested_quantity <= 0 then
      raise exception 'Quantidade devolvida deve ser positiva';
    end if;

    select coalesce(sum(quantity), 0)
      into already_returned
    from public.business_sale_return_items
    where sale_item_id = sale_item_row.id
      and user_id = current_user_id
      and workspace_id = sale_row.workspace_id;

    if requested_quantity > sale_item_row.quantity - already_returned then
      raise exception 'Devolucao maior que a quantidade entregue disponivel';
    end if;

    current_return_value := round(
      current_return_value
      + (
        sale_item_row.final_amount
        * requested_quantity::numeric
        / sale_item_row.quantity
      ),
      2
    );

    insert into public.business_sale_return_items (
      user_id,
      workspace_id,
      return_id,
      sale_item_id,
      product_id,
      quantity,
      restockable
    )
    values (
      current_user_id,
      sale_row.workspace_id,
      return_id,
      sale_item_row.id,
      sale_item_row.product_id,
      requested_quantity,
      restockable
    );

    remaining_quantity := requested_quantity;

    for allocation_row in
      select
        allocation.id,
        allocation.inventory_lot_id,
        allocation.quantity,
        allocation.returned_quantity,
        allocation.unit_cost,
        lot.product_id
      from public.business_sale_item_allocations allocation
      join public.business_inventory_lots lot
        on lot.id = allocation.inventory_lot_id
        and lot.user_id = allocation.user_id
        and lot.workspace_id = allocation.workspace_id
      where allocation.sale_item_id = sale_item_row.id
        and allocation.user_id = current_user_id
        and allocation.workspace_id = sale_row.workspace_id
        and allocation.status in ('CONSUMED', 'RETURNED')
        and allocation.returned_quantity < allocation.quantity
      order by allocation.created_at, allocation.id
      for update of allocation, lot
    loop
      exit when remaining_quantity <= 0;
      alloc_return_quantity := least(remaining_quantity, allocation_row.quantity - allocation_row.returned_quantity);

      if restockable then
        update public.business_inventory_lots
        set remaining_quantity = public.business_inventory_lots.remaining_quantity + alloc_return_quantity
        where id = allocation_row.inventory_lot_id;

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
          sale_row.workspace_id,
          allocation_row.product_id,
          allocation_row.inventory_lot_id,
          'CUSTOMER_RETURN',
          alloc_return_quantity,
          allocation_row.unit_cost,
          round(alloc_return_quantity * allocation_row.unit_cost, 2),
          'sale_return',
          return_id
        );
      end if;

      update public.business_sale_item_allocations
      set returned_quantity = returned_quantity + alloc_return_quantity,
          status = case when returned_quantity + alloc_return_quantity = quantity then 'RETURNED' else status end
      where id = allocation_row.id;

      remaining_quantity := remaining_quantity - alloc_return_quantity;
      total_returned := total_returned + alloc_return_quantity;
    end loop;

    if remaining_quantity > 0 then
      raise exception 'Nao ha alocacoes entregues suficientes para devolucao';
    end if;
  end loop;

  select coalesce(sum(quantity), 0)
    into total_sale_quantity
  from public.business_sale_items
  where sale_id = sale_row.id
    and user_id = current_user_id
    and workspace_id = sale_row.workspace_id;

  select coalesce(sum(quantity), 0)
    into total_returned_all_time
  from public.business_sale_return_items
  where user_id = current_user_id
    and workspace_id = sale_row.workspace_id
    and sale_item_id in (
      select id from public.business_sale_items where sale_id = sale_row.id
    );

  max_refund_amount := current_return_value;
  if total_sale_quantity > 0 and total_returned_all_time >= total_sale_quantity then
    max_refund_amount := round(max_refund_amount + coalesce(sale_row.delivery_fee, 0), 2);
  end if;

  if round(coalesce(p_refund_amount, 0), 2) > max_refund_amount then
    raise exception 'Reembolso maior que o valor devolvido disponivel';
  end if;

  if coalesce(p_refund_amount, 0) > 0 then
    response := public.record_business_payment(sale_row.id, p_refund_amount, p_idempotency_key || ':refund', 'devolucao', 'REFUNDED', now(), p_notes);
  end if;

  if total_returned_all_time >= total_sale_quantity then
    update public.business_sales
    set order_status = 'RETURNED'
    where id = sale_row.id;
  end if;

  perform public.business_log_audit(current_user_id, current_user_id, sale_row.workspace_id, 'sale', sale_row.id, 'sale_returned', jsonb_build_object('return_id', return_id, 'returned_quantity', total_returned, 'refund_amount', round(coalesce(p_refund_amount, 0), 2)));

  response := jsonb_build_object(
    'return_id', return_id,
    'sale_id', sale_row.id,
    'returned_quantity', total_returned,
    'refund_amount', round(coalesce(p_refund_amount, 0), 2),
    'status', case when total_returned_all_time >= total_sale_quantity then 'RETURNED' else sale_row.order_status end
  );
  perform public.business_complete_idempotency(current_user_id, sale_row.workspace_id, 'return_business_sale', p_idempotency_key, response);
  return response;
end;
$$;

revoke execute on function public.return_business_sale(uuid, jsonb, text, numeric, text) from public, anon;
grant execute on function public.return_business_sale(uuid, jsonb, text, numeric, text) to authenticated;
