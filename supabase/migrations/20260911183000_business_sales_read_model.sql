-- Scalable read model for business sales.
-- Pagination and financial summaries must never depend on client-side row limits.

create index if not exists idx_business_sales_workspace_sale_date
  on public.business_sales(user_id, workspace_id, sale_date desc, created_at desc, id desc);

create index if not exists idx_business_sale_return_items_sale_item
  on public.business_sale_return_items(sale_item_id);

create or replace function public.get_business_sales_page(
  p_workspace_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_status text default 'all',
  p_payment_status text default 'all',
  p_start_date date default null,
  p_end_date date default null,
  p_search text default null
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
    order by sale.sale_date desc, sale.created_at desc, sale.id desc
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
  text
) from public;

grant execute on function public.get_business_sales_page(
  uuid,
  integer,
  integer,
  text,
  text,
  date,
  date,
  text
) to authenticated;

create or replace function public.get_business_sales_summary(
  p_workspace_id uuid,
  p_status text default 'all',
  p_payment_status text default 'all',
  p_start_date date default null,
  p_end_date date default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
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
      sum(sale_return.refund_amount) as refunds
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
      coalesce(
        sum(payment.amount) filter (
          where payment.status = 'PAID'
        ),
        0
      ) as paid_total,
      coalesce(
        sum(payment.amount) filter (
          where payment.status = 'REFUNDED'
        ),
        0
      ) as refunded_total
    from public.business_payments payment
    join filtered_sales filtered_sale
      on filtered_sale.id = payment.sale_id
    where payment.user_id = current_user_id
      and payment.workspace_id = p_workspace_id
    group by payment.sale_id
  ),
  financials as (
    select
      filtered_sale.id,
      filtered_sale.order_status,
      greatest(
        round(
          coalesce(item_financial.gross_revenue, 0) -
          coalesce(return_financial.refunds, 0),
          2
        ),
        0
      ) as net_revenue,
      round(
        coalesce(item_financial.base_profit, 0) -
        coalesce(return_financial.refunds, 0) +
        coalesce(item_financial.recovered_cogs, 0),
        2
      ) as net_profit,
      greatest(
        round(
          greatest(
            coalesce(item_financial.gross_revenue, 0) -
            coalesce(return_financial.refunds, 0),
            0
          ) -
          (
            coalesce(payment_financial.paid_total, 0) -
            coalesce(payment_financial.refunded_total, 0)
          ),
          2
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
  ),
  aggregate_values as (
    select
      count(*) filter (
        where order_status not in ('DRAFT', 'CANCELLED')
      ) as sale_count,
      count(*) filter (
        where order_status in ('DELIVERED', 'RETURNED')
      ) as realized_count,
      coalesce(
        sum(net_revenue) filter (
          where order_status not in ('DRAFT', 'CANCELLED')
        ),
        0
      ) as sold_value,
      coalesce(
        sum(remaining_amount) filter (
          where order_status not in ('DRAFT', 'CANCELLED')
        ),
        0
      ) as receivable,
      coalesce(
        sum(net_profit) filter (
          where order_status in ('DELIVERED', 'RETURNED')
        ),
        0
      ) as realized_profit
    from financials
  )
  select jsonb_build_object(
    'count', sale_count,
    'realized', realized_count,
    'revenue', round(sold_value, 2),
    'receivable', round(receivable, 2),
    'profit', round(realized_profit, 2),
    'ticket',
      case
        when sale_count > 0
          then round(sold_value / sale_count, 2)
        else 0
      end
  )
    into result
  from aggregate_values;

  return coalesce(
    result,
    jsonb_build_object(
      'count', 0,
      'realized', 0,
      'revenue', 0,
      'receivable', 0,
      'profit', 0,
      'ticket', 0
    )
  );
end;
$$;

revoke all on function public.get_business_sales_summary(
  uuid,
  text,
  text,
  date,
  date,
  text
) from public;

grant execute on function public.get_business_sales_summary(
  uuid,
  text,
  text,
  date,
  date,
  text
) to authenticated;
