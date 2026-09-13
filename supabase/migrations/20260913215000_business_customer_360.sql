-- Customer 360: complete customer commercial relationship read model.

create index if not exists idx_business_payments_workspace_sale_status
  on public.business_payments(user_id, workspace_id, sale_id, status);

create index if not exists idx_business_returns_workspace_sale_created
  on public.business_sale_returns(user_id, workspace_id, sale_id, created_at desc);

create or replace function public.get_business_customer_360(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_page integer := greatest(coalesce(p_page, 1), 1);
  resolved_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 100);
  customer_row public.business_customers%rowtype;
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  select *
  into customer_row
  from public.business_customers customer
  where customer.id = p_customer_id
    and customer.user_id = current_user_id
    and customer.workspace_id = p_workspace_id;

  if not found then
    raise exception 'Cliente nao encontrado';
  end if;

  with customer_sales as (
    select
      sale.id,
      sale.sale_number,
      sale.order_status,
      sale.payment_status,
      sale.sale_date,
      sale.delivered_at,
      sale.notes,
      sale.created_at
    from public.business_sales sale
    where sale.user_id = current_user_id
      and sale.workspace_id = p_workspace_id
      and sale.customer_id = p_customer_id
  ),

  return_quantity_by_item as (
    select
      return_item.sale_item_id,
      coalesce(sum(return_item.quantity), 0)::integer as returned_quantity,
      coalesce(
        sum(return_item.quantity) filter (
          where return_item.restockable
        ),
        0
      )::integer as restockable_quantity
    from public.business_sale_return_items return_item
    join public.business_sale_items sale_item
      on sale_item.id = return_item.sale_item_id
     and sale_item.user_id = current_user_id
     and sale_item.workspace_id = p_workspace_id
    join customer_sales sale
      on sale.id = sale_item.sale_id
    where return_item.user_id = current_user_id
      and return_item.workspace_id = p_workspace_id
    group by return_item.sale_item_id
  ),

  item_financials as (
    select
      item.sale_id,
      coalesce(sum(item.final_amount), 0) as gross_revenue,
      coalesce(sum(item.net_profit), 0) as base_profit,
      coalesce(
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
        ),
        0
      ) as recovered_cogs
    from public.business_sale_items item
    join customer_sales sale
      on sale.id = item.sale_id
    left join return_quantity_by_item return_quantity
      on return_quantity.sale_item_id = item.id
    where item.user_id = current_user_id
      and item.workspace_id = p_workspace_id
    group by item.sale_id
  ),

  return_financials as (
    select
      sale_return.sale_id,
      coalesce(sum(sale_return.refund_amount), 0) as refunds,
      count(*)::integer as returns_count
    from public.business_sale_returns sale_return
    join customer_sales sale
      on sale.id = sale_return.sale_id
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
    join customer_sales sale
      on sale.id = payment.sale_id
    where payment.user_id = current_user_id
      and payment.workspace_id = p_workspace_id
    group by payment.sale_id
  ),

  sale_financials as (
    select
      sale.id,
      sale.sale_number,
      sale.order_status,
      sale.payment_status,
      sale.sale_date,
      sale.delivered_at,
      sale.notes,
      sale.created_at,

      round(
        coalesce(item_financial.gross_revenue, 0),
        2
      ) as gross_revenue,

      round(
        coalesce(return_financial.refunds, 0),
        2
      ) as refunded_amount,

      greatest(
        round(
          coalesce(item_financial.gross_revenue, 0) -
          coalesce(return_financial.refunds, 0),
          2
        ),
        0
      ) as net_revenue,

      round(
        coalesce(payment_financial.paid_total, 0),
        2
      ) as paid_total,

      round(
        coalesce(payment_financial.refunded_total, 0),
        2
      ) as refunded_payments,

      greatest(
        round(
          coalesce(payment_financial.paid_total, 0) -
          coalesce(payment_financial.refunded_total, 0),
          2
        ),
        0
      ) as net_paid,

      greatest(
        round(
          greatest(
            coalesce(item_financial.gross_revenue, 0) -
            coalesce(return_financial.refunds, 0),
            0
          ) - (
            coalesce(payment_financial.paid_total, 0) -
            coalesce(payment_financial.refunded_total, 0)
          ),
          2
        ),
        0
      ) as remaining_amount,

      round(
        coalesce(item_financial.base_profit, 0) -
        coalesce(return_financial.refunds, 0) +
        coalesce(item_financial.recovered_cogs, 0),
        2
      ) as net_profit,

      coalesce(
        return_financial.returns_count,
        0
      )::integer as returns_count

    from customer_sales sale
    left join item_financials item_financial
      on item_financial.sale_id = sale.id
    left join return_financials return_financial
      on return_financial.sale_id = sale.id
    left join payment_financials payment_financial
      on payment_financial.sale_id = sale.id
  ),

  valid_sales as (
    select *
    from sale_financials
    where order_status not in ('DRAFT', 'CANCELLED')
  ),

  customer_summary as (
    select
      count(*)::integer as orders,

      count(*) filter (
        where order_status in ('DELIVERED', 'RETURNED')
      )::integer as realized_orders,

      coalesce(sum(net_revenue), 0) as total_purchased,

      coalesce(sum(net_paid), 0) as total_paid,

      coalesce(sum(remaining_amount), 0) as open_balance,

      coalesce(sum(refunded_amount), 0) as total_refunded,

      coalesce(
        sum(net_profit) filter (
          where order_status in ('DELIVERED', 'RETURNED')
        ),
        0
      ) as realized_profit,

      max(sale_date) as last_purchase

    from valid_sales
  ),

  product_metrics as (
    select
      product.id,
      product.name,
      product.sku,
      product.barcode,
      product.image_url,

      coalesce(sum(item.quantity), 0)::integer as purchased_quantity,

      coalesce(
        sum(
          coalesce(return_quantity.returned_quantity, 0)
        ),
        0
      )::integer as returned_quantity,

      greatest(
        coalesce(sum(item.quantity), 0) -
        coalesce(
          sum(
            coalesce(return_quantity.returned_quantity, 0)
          ),
          0
        ),
        0
      )::integer as net_quantity,

      count(distinct item.sale_id)::integer as orders_count,

      round(
        coalesce(sum(item.final_amount), 0),
        2
      ) as gross_value

    from public.business_sale_items item
    join valid_sales sale
      on sale.id = item.sale_id
    join public.business_products product
      on product.id = item.product_id
     and product.user_id = current_user_id
     and product.workspace_id = p_workspace_id
    left join return_quantity_by_item return_quantity
      on return_quantity.sale_item_id = item.id

    where item.user_id = current_user_id
      and item.workspace_id = p_workspace_id

    group by
      product.id,
      product.name,
      product.sku,
      product.barcode,
      product.image_url
  ),

  top_products as (
    select *
    from product_metrics
    order by
      net_quantity desc,
      orders_count desc,
      gross_value desc,
      name asc
    limit 10
  ),

  payment_history as (
    select
      payment.id,
      payment.sale_id,
      sale.sale_number,
      payment.amount,
      payment.payment_method,
      payment.status,
      payment.paid_at,
      payment.notes,
      payment.created_at
    from public.business_payments payment
    join customer_sales sale
      on sale.id = payment.sale_id
    where payment.user_id = current_user_id
      and payment.workspace_id = p_workspace_id
    order by
      coalesce(payment.paid_at, payment.created_at) desc,
      payment.id desc
  ),

  return_history as (
    select
      sale_return.id,
      sale_return.sale_id,
      sale.sale_number,
      sale_return.refund_amount,
      sale_return.notes,
      sale_return.created_at,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', return_item.id,
              'sale_item_id', return_item.sale_item_id,
              'product_id', return_item.product_id,
              'product_name', product.name,
              'sku', product.sku,
              'quantity', return_item.quantity,
              'restockable', return_item.restockable
            )
            order by return_item.created_at asc
          )
          from public.business_sale_return_items return_item
          join public.business_products product
            on product.id = return_item.product_id
           and product.user_id = current_user_id
           and product.workspace_id = p_workspace_id
          where return_item.return_id = sale_return.id
            and return_item.user_id = current_user_id
            and return_item.workspace_id = p_workspace_id
        ),
        '[]'::jsonb
      ) as items
    from public.business_sale_returns sale_return
    join customer_sales sale
      on sale.id = sale_return.sale_id
    where sale_return.user_id = current_user_id
      and sale_return.workspace_id = p_workspace_id
    order by sale_return.created_at desc, sale_return.id desc
  ),

  sales_count as (
    select count(*)::integer as total_count
    from sale_financials
  ),

  sales_page as (
    select *
    from sale_financials
    order by sale_date desc, created_at desc, id desc
    offset (resolved_page - 1) * resolved_page_size
    limit resolved_page_size
  )

  select jsonb_build_object(
    'customer',
    jsonb_build_object(
      'id', customer_row.id,
      'name', customer_row.name,
      'whatsapp', customer_row.whatsapp,
      'notes', customer_row.notes,
      'created_at', customer_row.created_at,
      'updated_at', customer_row.updated_at
    ),

    'summary',
    jsonb_build_object(
      'orders',
      coalesce((select orders from customer_summary), 0),

      'realized_orders',
      coalesce((select realized_orders from customer_summary), 0),

      'total_purchased',
      round(
        coalesce(
          (select total_purchased from customer_summary),
          0
        ),
        2
      ),

      'total_paid',
      round(
        coalesce(
          (select total_paid from customer_summary),
          0
        ),
        2
      ),

      'open_balance',
      round(
        coalesce(
          (select open_balance from customer_summary),
          0
        ),
        2
      ),

      'ticket_average',
      case
        when coalesce(
          (select orders from customer_summary),
          0
        ) > 0
        then round(
          (
            select total_purchased
            from customer_summary
          ) /
          (
            select orders
            from customer_summary
          ),
          2
        )
        else 0
      end,

      'total_refunded',
      round(
        coalesce(
          (select total_refunded from customer_summary),
          0
        ),
        2
      ),

      'realized_profit',
      round(
        coalesce(
          (select realized_profit from customer_summary),
          0
        ),
        2
      ),

      'last_purchase',
      (select last_purchase from customer_summary),

      'customer_since',
      customer_row.created_at
    ),

    'top_products',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(top_products)
          order by
            net_quantity desc,
            orders_count desc,
            gross_value desc,
            name asc
        )
        from top_products
      ),
      '[]'::jsonb
    ),

    'payments',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(payment_history)
          order by
            coalesce(paid_at, created_at) desc,
            id desc
        )
        from payment_history
      ),
      '[]'::jsonb
    ),

    'returns',
    coalesce(
      (
        select jsonb_agg(
          to_jsonb(return_history)
          order by created_at desc, id desc
        )
        from return_history
      ),
      '[]'::jsonb
    ),

    'sales',
    jsonb_build_object(
      'rows',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(sales_page)
            order by sale_date desc, created_at desc, id desc
          )
          from sales_page
        ),
        '[]'::jsonb
      ),

      'total_count',
      (select total_count from sales_count),

      'page',
      resolved_page,

      'page_size',
      resolved_page_size,

      'total_pages',
      case
        when (select total_count from sales_count) = 0
          then 0
        else ceil(
          (select total_count from sales_count)::numeric /
          resolved_page_size
        )::integer
      end
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_business_customer_360(
  uuid,
  uuid,
  integer,
  integer
) from public;

grant execute on function public.get_business_customer_360(
  uuid,
  uuid,
  integer,
  integer
) to authenticated;