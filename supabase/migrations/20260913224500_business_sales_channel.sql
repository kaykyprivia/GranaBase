alter table public.business_sales
  add column if not exists sales_channel text not null default 'UNSPECIFIED';

alter table public.business_sales
  drop constraint if exists business_sales_sales_channel_check;

alter table public.business_sales
  add constraint business_sales_sales_channel_check
  check (
    sales_channel in (
      'UNSPECIFIED',
      'IN_PERSON',
      'WHATSAPP',
      'INSTAGRAM',
      'FACEBOOK_MARKETPLACE',
      'SHOPEE',
      'MERCADO_LIVRE',
      'WEBSITE',
      'OTHER'
    )
  );

create index if not exists idx_business_sales_workspace_channel_date
  on public.business_sales(
    user_id,
    workspace_id,
    sales_channel,
    sale_date desc,
    created_at desc,
    id desc
  );

drop function if exists public.create_business_sale(
  uuid,
  jsonb,
  text,
  uuid,
  timestamptz,
  text,
  boolean
);

create function public.create_business_sale(
  p_workspace_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_customer_id uuid default null,
  p_sale_date timestamptz default now(),
  p_notes text default null,
  p_reserve boolean default true,
  p_sales_channel text default 'IN_PERSON'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_id uuid;
  item_payload jsonb;
  item_product_id uuid;
  quantity integer;
  unit_sale_price numeric(12,2);
  discount_amount numeric(12,2);
  platform_fee numeric(12,2);
  shipping_cost numeric(12,2);
  additional_costs numeric(12,2);
  gross_amount numeric(12,2);
  final_amount numeric(12,2);
  available_quantity integer;
  request_hash text;
  existing_response jsonb;
  reserve_response jsonb;
  response jsonb;
  normalized_sales_channel text := upper(trim(coalesce(p_sales_channel, 'IN_PERSON')));
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  if normalized_sales_channel not in (
    'UNSPECIFIED',
    'IN_PERSON',
    'WHATSAPP',
    'INSTAGRAM',
    'FACEBOOK_MARKETPLACE',
    'SHOPEE',
    'MERCADO_LIVRE',
    'WEBSITE',
    'OTHER'
  ) then
    raise exception 'Canal de venda invalido';
  end if;

  request_hash := md5(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'items', p_items,
    'customer_id', p_customer_id,
    'sale_date', p_sale_date,
    'notes', p_notes,
    'reserve', p_reserve,
    'sales_channel', normalized_sales_channel
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_sale',
    p_idempotency_key,
    request_hash
  );

  if existing_response is not null then
    return existing_response;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Venda precisa receber uma lista de itens';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Venda precisa ter ao menos um item';
  end if;

  if p_customer_id is not null and not exists (
    select 1
    from public.business_customers
    where id = p_customer_id
      and user_id = current_user_id
      and workspace_id = p_workspace_id
  ) then
    raise exception 'Cliente nao encontrado';
  end if;

  insert into public.business_sales (
    user_id,
    workspace_id,
    customer_id,
    order_status,
    payment_status,
    sale_date,
    notes,
    sales_channel
  )
  values (
    current_user_id,
    p_workspace_id,
    p_customer_id,
    'DRAFT',
    'PENDING',
    coalesce(p_sale_date, now()),
    nullif(trim(p_notes), ''),
    normalized_sales_channel
  )
  returning id into sale_id;

  for item_payload in
    select *
    from jsonb_array_elements(p_items)
  loop
    item_product_id := (item_payload->>'product_id')::uuid;
    quantity := (item_payload->>'quantity')::integer;
    unit_sale_price := round((item_payload->>'unit_sale_price')::numeric, 2);
    discount_amount := round(coalesce((item_payload->>'discount_amount')::numeric, 0), 2);
    platform_fee := round(coalesce((item_payload->>'platform_fee')::numeric, 0), 2);
    shipping_cost := round(coalesce((item_payload->>'shipping_cost')::numeric, 0), 2);
    additional_costs := round(coalesce((item_payload->>'additional_costs')::numeric, 0), 2);

    if not exists (
      select 1
      from public.business_products
      where id = item_product_id
        and user_id = current_user_id
        and workspace_id = p_workspace_id
        and active = true
    ) then
      raise exception 'Produto da venda nao encontrado';
    end if;

    if quantity <= 0
      or unit_sale_price < 0
      or discount_amount < 0
      or platform_fee < 0
      or shipping_cost < 0
      or additional_costs < 0 then
      raise exception 'Item de venda invalido';
    end if;

    gross_amount := round(quantity * unit_sale_price, 2);

    if discount_amount > gross_amount then
      raise exception 'Desconto maior que o valor bruto';
    end if;

    final_amount := round(gross_amount - discount_amount, 2);

    select coalesce(sum(remaining_quantity - reserved_quantity), 0)
      into available_quantity
    from public.business_inventory_lots
    where user_id = current_user_id
      and workspace_id = p_workspace_id
      and product_id = item_product_id;

    if available_quantity < quantity then
      raise exception 'Estoque insuficiente para criar a venda';
    end if;

    insert into public.business_sale_items (
      user_id,
      workspace_id,
      sale_id,
      product_id,
      quantity,
      unit_sale_price,
      gross_amount,
      discount_amount,
      final_amount,
      platform_fee,
      shipping_cost,
      additional_costs,
      gross_profit,
      net_profit,
      margin_pct
    )
    values (
      current_user_id,
      p_workspace_id,
      sale_id,
      item_product_id,
      quantity,
      unit_sale_price,
      gross_amount,
      discount_amount,
      final_amount,
      platform_fee,
      shipping_cost,
      additional_costs,
      final_amount,
      round(final_amount - platform_fee - shipping_cost - additional_costs, 2),
      case
        when final_amount > 0 then
          round(
            (
              (
                final_amount
                - platform_fee
                - shipping_cost
                - additional_costs
              ) / final_amount
            ) * 100,
            4
          )
        else null
      end
    );
  end loop;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    p_workspace_id,
    'sale',
    sale_id,
    'sale_created',
    jsonb_build_object(
      'items_count', jsonb_array_length(p_items),
      'reserve', p_reserve,
      'sales_channel', normalized_sales_channel
    )
  );

  if coalesce(p_reserve, true) then
    reserve_response := public.reserve_business_sale(
      sale_id,
      p_idempotency_key || ':reserve'
    );
  end if;

  response := jsonb_build_object(
    'sale_id', sale_id,
    'status',
      case
        when coalesce(p_reserve, true) then 'RESERVED'
        else 'DRAFT'
      end,
    'reserve', reserve_response
  );

  perform public.business_complete_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_sale',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

revoke all on function public.create_business_sale(
  uuid,
  jsonb,
  text,
  uuid,
  timestamptz,
  text,
  boolean,
  text
) from public, anon;

grant execute on function public.create_business_sale(
  uuid,
  jsonb,
  text,
  uuid,
  timestamptz,
  text,
  boolean,
  text
) to authenticated;
drop function if exists public.get_business_sales_page(
  uuid,
  integer,
  integer,
  text,
  text,
  date,
  date,
  text
);

create function public.get_business_sales_page(
  p_workspace_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_status text default 'all',
  p_payment_status text default 'all',
  p_start_date date default null,
  p_end_date date default null,
  p_search text default null,
  p_sales_channel text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  effective_page integer := greatest(coalesce(p_page, 1), 1);
  effective_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  effective_offset integer;
  normalized_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
  normalized_sales_channel text := upper(trim(coalesce(p_sales_channel, 'all')));
  total_count bigint;
  page_ids jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  if p_status not in (
    'all',
    'open',
    'DRAFT',
    'RESERVED',
    'SEPARATED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURNED'
  ) then
    raise exception 'Filtro de status de venda invalido';
  end if;

  if p_payment_status not in (
    'all',
    'PENDING',
    'PARTIALLY_PAID',
    'PAID',
    'REFUNDED'
  ) then
    raise exception 'Filtro de pagamento invalido';
  end if;

  if normalized_sales_channel not in (
    'ALL',
    'UNSPECIFIED',
    'IN_PERSON',
    'WHATSAPP',
    'INSTAGRAM',
    'FACEBOOK_MARKETPLACE',
    'SHOPEE',
    'MERCADO_LIVRE',
    'WEBSITE',
    'OTHER'
  ) then
    raise exception 'Filtro de canal de venda invalido';
  end if;

  if p_start_date is not null
    and p_end_date is not null
    and p_end_date < p_start_date then
    raise exception 'Periodo de vendas invalido';
  end if;

  effective_offset := (effective_page - 1) * effective_page_size;

  select count(*)
    into total_count
  from public.business_sales sale
  where sale.user_id = current_user_id
    and sale.workspace_id = p_workspace_id
    and (
      p_status = 'all'
      or (
        p_status = 'open'
        and sale.order_status not in ('DELIVERED', 'CANCELLED', 'RETURNED')
      )
      or sale.order_status = p_status
    )
    and (
      p_payment_status = 'all'
      or sale.payment_status = p_payment_status
    )
    and (
      normalized_sales_channel = 'ALL'
      or sale.sales_channel = normalized_sales_channel
    )
    and (
      p_start_date is null
      or sale.sale_date >= p_start_date::timestamptz
    )
    and (
      p_end_date is null
      or sale.sale_date < (p_end_date + 1)::timestamptz
    )
    and (
      normalized_search is null
      or position(normalized_search in lower(sale.id::text)) > 0
      or position(normalized_search in lower(sale.sale_number::text)) > 0
      or exists (
        select 1
        from public.business_customers customer
        where customer.id = sale.customer_id
          and customer.user_id = current_user_id
          and customer.workspace_id = p_workspace_id
          and (
            position(normalized_search in lower(customer.name)) > 0
            or position(
              normalized_search
              in lower(coalesce(customer.whatsapp, ''))
            ) > 0
          )
      )
      or exists (
        select 1
        from public.business_sale_items item
        join public.business_products product
          on product.id = item.product_id
         and product.user_id = item.user_id
         and product.workspace_id = item.workspace_id
        where item.sale_id = sale.id
          and item.user_id = current_user_id
          and item.workspace_id = p_workspace_id
          and position(normalized_search in lower(product.name)) > 0
      )
    );

  select coalesce(
    jsonb_agg(
      page_row.id
      order by
        page_row.sale_date desc,
        page_row.created_at desc,
        page_row.id desc
    ),
    '[]'::jsonb
  )
    into page_ids
  from (
    select
      sale.id,
      sale.sale_date,
      sale.created_at
    from public.business_sales sale
    where sale.user_id = current_user_id
      and sale.workspace_id = p_workspace_id
      and (
        p_status = 'all'
        or (
          p_status = 'open'
          and sale.order_status not in ('DELIVERED', 'CANCELLED', 'RETURNED')
        )
        or sale.order_status = p_status
      )
      and (
        p_payment_status = 'all'
        or sale.payment_status = p_payment_status
      )
      and (
        normalized_sales_channel = 'ALL'
        or sale.sales_channel = normalized_sales_channel
      )
      and (
        p_start_date is null
        or sale.sale_date >= p_start_date::timestamptz
      )
      and (
        p_end_date is null
        or sale.sale_date < (p_end_date + 1)::timestamptz
      )
      and (
        normalized_search is null
        or position(normalized_search in lower(sale.id::text)) > 0
        or position(normalized_search in lower(sale.sale_number::text)) > 0
        or exists (
          select 1
          from public.business_customers customer
          where customer.id = sale.customer_id
            and customer.user_id = current_user_id
            and customer.workspace_id = p_workspace_id
            and (
              position(normalized_search in lower(customer.name)) > 0
              or position(
                normalized_search
                in lower(coalesce(customer.whatsapp, ''))
              ) > 0
            )
        )
        or exists (
          select 1
          from public.business_sale_items item
          join public.business_products product
            on product.id = item.product_id
           and product.user_id = item.user_id
           and product.workspace_id = item.workspace_id
          where item.sale_id = sale.id
            and item.user_id = current_user_id
            and item.workspace_id = p_workspace_id
            and position(normalized_search in lower(product.name)) > 0
        )
      )
    order by
      sale.sale_date desc,
      sale.created_at desc,
      sale.id desc
    limit effective_page_size
    offset effective_offset
  ) page_row;

  return jsonb_build_object(
    'sale_ids', page_ids,
    'total_count', total_count,
    'page', effective_page,
    'page_size', effective_page_size,
    'total_pages',
      case
        when total_count = 0 then 0
        else ceil(total_count::numeric / effective_page_size)::integer
      end
  );
end;
$$;

revoke all on function public.get_business_sales_page(
  uuid,
  integer,
  integer,
  text,
  text,
  date,
  date,
  text,
  text
) from public, anon;

grant execute on function public.get_business_sales_page(
  uuid,
  integer,
  integer,
  text,
  text,
  date,
  date,
  text,
  text
) to authenticated;

drop function if exists public.get_business_sales_summary(
  uuid,
  text,
  text,
  date,
  date,
  text
);

create function public.get_business_sales_summary(
  p_workspace_id uuid,
  p_status text default 'all',
  p_payment_status text default 'all',
  p_start_date date default null,
  p_end_date date default null,
  p_search text default null,
  p_sales_channel text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
  normalized_sales_channel text := upper(trim(coalesce(p_sales_channel, 'all')));
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  if p_status not in (
    'all',
    'open',
    'DRAFT',
    'RESERVED',
    'SEPARATED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURNED'
  ) then
    raise exception 'Filtro de status de venda invalido';
  end if;

  if p_payment_status not in (
    'all',
    'PENDING',
    'PARTIALLY_PAID',
    'PAID',
    'REFUNDED'
  ) then
    raise exception 'Filtro de pagamento invalido';
  end if;

  if normalized_sales_channel not in (
    'ALL',
    'UNSPECIFIED',
    'IN_PERSON',
    'WHATSAPP',
    'INSTAGRAM',
    'FACEBOOK_MARKETPLACE',
    'SHOPEE',
    'MERCADO_LIVRE',
    'WEBSITE',
    'OTHER'
  ) then
    raise exception 'Filtro de canal de venda invalido';
  end if;

  if p_start_date is not null
    and p_end_date is not null
    and p_end_date < p_start_date then
    raise exception 'Periodo de vendas invalido';
  end if;

  with filtered_sales as (
    select
      sale.id,
      sale.order_status
    from public.business_sales sale
    where sale.user_id = current_user_id
      and sale.workspace_id = p_workspace_id
      and (
        p_status = 'all'
        or (
          p_status = 'open'
          and sale.order_status not in ('DELIVERED', 'CANCELLED', 'RETURNED')
        )
        or sale.order_status = p_status
      )
      and (
        p_payment_status = 'all'
        or sale.payment_status = p_payment_status
      )
      and (
        normalized_sales_channel = 'ALL'
        or sale.sales_channel = normalized_sales_channel
      )
      and (
        p_start_date is null
        or sale.sale_date >= p_start_date::timestamptz
      )
      and (
        p_end_date is null
        or sale.sale_date < (p_end_date + 1)::timestamptz
      )
      and (
        normalized_search is null
        or position(normalized_search in lower(sale.id::text)) > 0
        or position(normalized_search in lower(sale.sale_number::text)) > 0
        or exists (
          select 1
          from public.business_customers customer
          where customer.id = sale.customer_id
            and customer.user_id = current_user_id
            and customer.workspace_id = p_workspace_id
            and (
              position(normalized_search in lower(customer.name)) > 0
              or position(
                normalized_search
                in lower(coalesce(customer.whatsapp, ''))
              ) > 0
            )
        )
        or exists (
          select 1
          from public.business_sale_items item
          join public.business_products product
            on product.id = item.product_id
           and product.user_id = item.user_id
           and product.workspace_id = item.workspace_id
          where item.sale_id = sale.id
            and item.user_id = current_user_id
            and item.workspace_id = p_workspace_id
            and position(normalized_search in lower(product.name)) > 0
        )
      )
  ),
  return_quantity_by_item as (
    select
      return_item.sale_item_id,
      sum(return_item.quantity) filter (
        where return_item.restockable
      ) as restockable_quantity
    from public.business_sale_return_items return_item
    join public.business_sale_items sale_item
      on sale_item.id = return_item.sale_item_id
     and sale_item.user_id = current_user_id
     and sale_item.workspace_id = p_workspace_id
    join filtered_sales filtered_sale
      on filtered_sale.id = sale_item.sale_id
    where return_item.user_id = current_user_id
      and return_item.workspace_id = p_workspace_id
    group by return_item.sale_item_id
  ),
  item_financials as (
    select
      item.sale_id,
      sum(item.final_amount) as gross_revenue,
      sum(item.net_profit) as base_profit,
      sum(
        case
          when item.quantity <= 0 then 0
          else (
            item.cogs_amount / item.quantity
          ) * least(
            item.quantity,
            coalesce(return_quantity.restockable_quantity, 0)
          )
        end
      ) as recovered_cogs
    from public.business_sale_items item
    join filtered_sales filtered_sale
      on filtered_sale.id = item.sale_id
    left join return_quantity_by_item return_quantity
      on return_quantity.sale_item_id = item.id
    where item.user_id = current_user_id
      and item.workspace_id = p_workspace_id
    group by item.sale_id
  ),
  return_financials as (
    select
      sale_return.sale_id,
      sum(sale_return.refund_amount) as refunded_amount
    from public.business_sale_returns sale_return
    join filtered_sales filtered_sale
      on filtered_sale.id = sale_return.sale_id
    where sale_return.user_id = current_user_id
      and sale_return.workspace_id = p_workspace_id
    group by sale_return.sale_id
  ),
  payment_financials as (
    select
      payment.sale_id,
      sum(payment.amount) filter (
        where payment.status = 'PAID'
      ) as paid_amount,
      sum(payment.amount) filter (
        where payment.status = 'REFUNDED'
      ) as refunded_payment_amount
    from public.business_payments payment
    join filtered_sales filtered_sale
      on filtered_sale.id = payment.sale_id
    where payment.user_id = current_user_id
      and payment.workspace_id = p_workspace_id
    group by payment.sale_id
  ),
  sale_financials as (
    select
      filtered_sale.id,
      filtered_sale.order_status,
      greatest(
        coalesce(item_financial.gross_revenue, 0)
        - coalesce(return_financial.refunded_amount, 0),
        0
      ) as net_revenue,
      (
        coalesce(item_financial.base_profit, 0)
        - coalesce(return_financial.refunded_amount, 0)
        + coalesce(item_financial.recovered_cogs, 0)
      ) as net_profit,
      greatest(
        coalesce(item_financial.gross_revenue, 0)
        - coalesce(return_financial.refunded_amount, 0)
        - (
          coalesce(payment_financial.paid_amount, 0)
          - coalesce(payment_financial.refunded_payment_amount, 0)
        ),
        0
      ) as remaining_amount
    from filtered_sales filtered_sale
    left join item_financials item_financial
      on item_financial.sale_id = filtered_sale.id
    left join return_financials return_financial
      on return_financial.sale_id = filtered_sale.id
    left join payment_financials payment_financial
      on payment_financial.sale_id = filtered_sale.id
  )
  select jsonb_build_object(
    'count',
      count(*) filter (
        where order_status <> 'CANCELLED'
      ),
    'realized',
      count(*) filter (
        where order_status in ('DELIVERED', 'RETURNED')
      ),
    'revenue',
      coalesce(
        sum(net_revenue) filter (
          where order_status <> 'CANCELLED'
        ),
        0
      ),
    'receivable',
      coalesce(
        sum(remaining_amount) filter (
          where order_status <> 'CANCELLED'
        ),
        0
      ),
    'profit',
      coalesce(
        sum(net_profit) filter (
          where order_status in ('DELIVERED', 'RETURNED')
        ),
        0
      ),
    'ticket',
      case
        when count(*) filter (
          where order_status <> 'CANCELLED'
        ) = 0 then 0
        else
          coalesce(
            sum(net_revenue) filter (
              where order_status <> 'CANCELLED'
            ),
            0
          )
          /
          count(*) filter (
            where order_status <> 'CANCELLED'
          )
      end
  )
  into result
  from sale_financials;

  return result;
end;
$$;

revoke all on function public.get_business_sales_summary(
  uuid,
  text,
  text,
  date,
  date,
  text,
  text
) from public, anon;

grant execute on function public.get_business_sales_summary(
  uuid,
  text,
  text,
  date,
  date,
  text,
  text
) to authenticated;