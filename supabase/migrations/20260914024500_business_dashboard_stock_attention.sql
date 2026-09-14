create or replace function public.get_business_dashboard_operations(
  p_workspace_id uuid,
  p_period text default 'month',
  p_today date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  range_start date;
  range_end date := coalesce(p_today, current_date);
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  if p_period not in ('month', '3m', '6m', '12m', 'all') then
    raise exception 'Periodo de dashboard invalido';
  end if;

  range_start :=
    case p_period
      when 'month' then date_trunc('month', range_end)::date
      when '3m' then (date_trunc('month', range_end) - interval '2 months')::date
      when '6m' then (date_trunc('month', range_end) - interval '5 months')::date
      when '12m' then (date_trunc('month', range_end) - interval '11 months')::date
      else null
    end;

  return (
    with period_sales as (
      select
        sale.id,
        sale.customer_id,
        sale.sale_date,
        sale.sales_channel,
        sale.delivery_fee
      from public.business_sales sale
      where sale.user_id = current_user_id
        and sale.workspace_id = p_workspace_id
        and sale.order_status in ('DELIVERED', 'RETURNED')
        and (
          range_start is null
          or sale.sale_date::date >= range_start
        )
        and sale.sale_date::date <= range_end
    ),

    period_item_totals as (
      select
        item.sale_id,
        coalesce(sum(item.final_amount), 0) as gross_revenue,
        coalesce(sum(item.cogs_amount), 0) as gross_cogs
      from public.business_sale_items item
      join period_sales sale
        on sale.id = item.sale_id
      where item.user_id = current_user_id
        and item.workspace_id = p_workspace_id
      group by item.sale_id
    ),

    period_refunds as (
      select
        sale_return.sale_id,
        coalesce(sum(sale_return.refund_amount), 0) as refunds
      from public.business_sale_returns sale_return
      join period_sales sale
        on sale.id = sale_return.sale_id
      where sale_return.user_id = current_user_id
        and sale_return.workspace_id = p_workspace_id
      group by sale_return.sale_id
    ),

    period_restockable_quantity_by_item as (
      select
        return_item.sale_item_id,
        coalesce(
          sum(return_item.quantity) filter (
            where return_item.restockable
          ),
          0
        ) as quantity
      from public.business_sale_return_items return_item
      join public.business_sale_items item
        on item.id = return_item.sale_item_id
      join period_sales sale
        on sale.id = item.sale_id
      where return_item.user_id = current_user_id
        and return_item.workspace_id = p_workspace_id
      group by return_item.sale_item_id
    ),

    period_recovered_cogs as (
      select
        coalesce(
          sum(
            case
              when item.quantity > 0 then
                (
                  item.cogs_amount
                  / item.quantity
                )
                * least(
                    item.quantity,
                    coalesce(returned.quantity, 0)
                  )
              else 0
            end
          ),
          0
        ) as recovered_cogs
      from public.business_sale_items item
      join period_sales sale
        on sale.id = item.sale_id
      left join period_restockable_quantity_by_item returned
        on returned.sale_item_id = item.id
      where item.user_id = current_user_id
        and item.workspace_id = p_workspace_id
    ),
    period_financials as (
      select
        sale.id as sale_id,
        sale.customer_id,
        sale.sale_date,
        sale.sales_channel,
        greatest(
          coalesce(items.gross_revenue, 0)
          + coalesce(sale.delivery_fee, 0)
          - coalesce(refunds.refunds, 0),
          0
        ) as revenue
      from period_sales sale
      left join period_item_totals items
        on items.sale_id = sale.id
      left join period_refunds refunds
        on refunds.sale_id = sale.id
    ),

    channel_rows as (
      select
        financial.sales_channel as channel,
        count(*)::integer as sales_count,
        coalesce(sum(financial.revenue), 0) as revenue
      from period_financials financial
      group by financial.sales_channel
    ),

    customer_rows as (
      select
        financial.customer_id,
        customer.name,
        count(*)::integer as orders,
        coalesce(sum(financial.revenue), 0) as revenue,
        max(financial.sale_date) as last_purchase
      from period_financials financial
      join public.business_customers customer
        on customer.id = financial.customer_id
        and customer.user_id = current_user_id
        and customer.workspace_id = p_workspace_id
      where financial.customer_id is not null
      group by financial.customer_id, customer.name
    ),

    inventory_rows as (
      select inventory.*
      from public.business_inventory_summary inventory
      where inventory.user_id = current_user_id
        and inventory.workspace_id = p_workspace_id
    ),

    inventory_summary as (
      select
        coalesce(sum(inventory_value), 0) as inventory_value,
        count(*) filter (where on_hand > 0)::integer as products_in_stock,
        coalesce(sum(available), 0)::integer as available_units,
        count(*) filter (
          where (
            on_hand = 0
            and in_transit = 0
          )
          or (
            minimum_stock > 0
            and available <= minimum_stock
          )
        )::integer as low_stock_products,
        count(*) filter (
          where on_hand = 0
            and in_transit = 0
        )::integer as out_of_stock_products,
        coalesce(sum(in_transit), 0)::integer as in_transit_units
      from inventory_rows
    ),

    low_stock_rows as (
      select
        inventory.product_id,
        inventory.name,
        inventory.available,
        inventory.minimum_stock,
        inventory.in_transit,
        inventory.inventory_value
      from inventory_rows inventory
      where (
        inventory.on_hand = 0
        and inventory.in_transit = 0
      )
      or (
        inventory.minimum_stock > 0
        and inventory.available <= inventory.minimum_stock
      )
      order by
        inventory.available asc,
        inventory.minimum_stock desc,
        inventory.name asc
      limit 5
    ),

    purchase_summary as (
      select
        count(*)::integer as open_purchases,
        coalesce(sum(purchase.total_cost), 0) as open_purchase_investment,
        count(*) filter (
          where purchase.expected_arrival_date is not null
            and purchase.expected_arrival_date >= range_end
            and purchase.expected_arrival_date <= range_end + 7
        )::integer as arriving_soon
      from public.business_purchase_orders purchase
      where purchase.user_id = current_user_id
        and purchase.workspace_id = p_workspace_id
        and purchase.status in (
          'PURCHASED',
          'IN_TRANSIT',
          'PARTIALLY_RECEIVED'
        )
    ),

    sales_operations as (
      select
        count(*) filter (
          where sale.order_status in (
            'DRAFT',
            'RESERVED',
            'SEPARATED',
            'SHIPPED'
          )
        )::integer as open_sales,
        count(*) filter (
          where sale.order_status <> 'CANCELLED'
            and sale.payment_status in (
              'PENDING',
              'PARTIALLY_PAID'
            )
        )::integer as pending_payment_sales
      from public.business_sales sale
      where sale.user_id = current_user_id
        and sale.workspace_id = p_workspace_id
    )

    select jsonb_build_object(
      'summary',
      jsonb_build_object(
        'cogs',
          round(
            greatest(
              coalesce(
                (select sum(gross_cogs) from period_item_totals),
                0
              )
              - coalesce(
                  (select recovered_cogs from period_recovered_cogs),
                  0
                ),
              0
            )::numeric,
            2
          ),
        'openSales',
          coalesce(
            (select open_sales from sales_operations),
            0
          ),
        'pendingPaymentSales',
          coalesce(
            (select pending_payment_sales from sales_operations),
            0
          ),
        'openPurchases',
          coalesce(
            (select open_purchases from purchase_summary),
            0
          ),
        'openPurchaseInvestment',
          round(
            coalesce(
              (select open_purchase_investment from purchase_summary),
              0
            )::numeric,
            2
          ),
        'arrivingSoon',
          coalesce(
            (select arriving_soon from purchase_summary),
            0
          ),
        'inventoryValue',
          round(
            coalesce(
              (select inventory_value from inventory_summary),
              0
            )::numeric,
            2
          ),
        'productsInStock',
          coalesce(
            (select products_in_stock from inventory_summary),
            0
          ),
        'availableUnits',
          coalesce(
            (select available_units from inventory_summary),
            0
          ),
        'lowStockProducts',
          coalesce(
            (select low_stock_products from inventory_summary),
            0
          ),
        'outOfStockProducts',
          coalesce(
            (select out_of_stock_products from inventory_summary),
            0
          ),
        'inTransitUnits',
          coalesce(
            (select in_transit_units from inventory_summary),
            0
          )
      ),

      'channels',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'channel', row.channel,
              'salesCount', row.sales_count,
              'revenue', round(row.revenue::numeric, 2)
            )
            order by row.revenue desc, row.sales_count desc
          )
          from channel_rows row
        ),
        '[]'::jsonb
      ),

      'topCustomers',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'customerId', ranked.customer_id,
              'name', ranked.name,
              'orders', ranked.orders,
              'revenue', round(ranked.revenue::numeric, 2),
              'lastPurchase', ranked.last_purchase
            )
            order by ranked.revenue desc, ranked.orders desc
          )
          from (
            select *
            from customer_rows
            order by revenue desc, orders desc
            limit 5
          ) ranked
        ),
        '[]'::jsonb
      ),

      'lowStock',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'productId', row.product_id,
              'name', row.name,
              'available', row.available,
              'minimumStock', row.minimum_stock,
              'inTransit', row.in_transit,
              'inventoryValue', round(row.inventory_value::numeric, 2)
            )
            order by row.available asc, row.minimum_stock desc, row.name asc
          )
          from low_stock_rows row
        ),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke all on function public.get_business_dashboard_operations(
  uuid,
  text,
  date
) from public, anon;

grant execute on function public.get_business_dashboard_operations(
  uuid,
  text,
  date
) to authenticated;