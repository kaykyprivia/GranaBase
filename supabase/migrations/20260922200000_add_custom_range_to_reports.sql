-- ============================================================
-- Adiciona periodo customizado na RPC de reports
-- Aceita p_custom_start e p_custom_end (opcionais)
-- Se preenchidos, sobrescrevem o calculo do p_period
-- ============================================================

drop function if exists public.get_business_reports_analytics(uuid, text, date);

create or replace function public.get_business_reports_analytics(
  p_workspace_id uuid,
  p_period text default 'month',
  p_today date default current_date,
  p_custom_start date default null,
  p_custom_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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

  -- Se veio range customizado, usa
  if p_custom_start is not null and p_custom_end is not null then
    range_start := p_custom_start;
    range_end := p_custom_end;
  else
    -- Senao calcula pelo p_period
    if p_period not in ('month', '3m', '6m', '12m', 'all') then
      raise exception 'Periodo de relatorio invalido';
    end if;

    range_start :=
      case p_period
        when 'month' then date_trunc('month', range_end)::date
        when '3m' then (date_trunc('month', range_end) - interval '2 months')::date
        when '6m' then (date_trunc('month', range_end) - interval '5 months')::date
        when '12m' then (date_trunc('month', range_end) - interval '11 months')::date
        else null
      end;
  end if;

  return (
    with period_sales as (
      select
        sale.id,
        sale.sale_date,
        sale.order_status,
        sale.delivery_fee,
        sale.delivery_cost
      from public.business_sales sale
      where sale.user_id = current_user_id
        and sale.workspace_id = p_workspace_id
        and sale.order_status <> 'CANCELLED'
        and (
          range_start is null
          or sale.sale_date::date >= range_start
        )
        and sale.sale_date::date <= range_end
    ),

    period_sale_item_totals as (
      select
        item.sale_id,
        coalesce(sum(item.final_amount), 0) as gross_revenue
      from public.business_sale_items item
      join period_sales sale
        on sale.id = item.sale_id
      where item.user_id = current_user_id
        and item.workspace_id = p_workspace_id
      group by item.sale_id
    ),

    period_sale_refunds as (
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

    period_sale_values as (
      select
        sale.id as sale_id,
        greatest(
          coalesce(items.gross_revenue, 0)
          + coalesce(sale.delivery_fee, 0)
          - coalesce(refunds.refunds, 0),
          0
        ) as net_revenue
      from period_sales sale
      left join period_sale_item_totals items
        on items.sale_id = sale.id
      left join period_sale_refunds refunds
        on refunds.sale_id = sale.id
    ),

    period_sale_payments as (
      select
        payment.sale_id,
        coalesce(
          sum(
            case
              when payment.status = 'PAID'
                then payment.amount
              when payment.status = 'REFUNDED'
                then -payment.amount
              else 0
            end
          ),
          0
        ) as net_paid
      from public.business_payments payment
      join period_sales sale
        on sale.id = payment.sale_id
      where payment.user_id = current_user_id
        and payment.workspace_id = p_workspace_id
      group by payment.sale_id
    ),

    receivable_value as (
      select
        coalesce(
          sum(
            greatest(
              sale.net_revenue
              - coalesce(payment.net_paid, 0),
              0
            )
          ),
          0
        ) as value
      from period_sale_values sale
      left join period_sale_payments payment
        on payment.sale_id = sale.sale_id
    ),

    realized_sales as (
      select *
      from period_sales
      where order_status in ('DELIVERED', 'RETURNED')
    ),

    realized_items as (
      select
        item.id,
        item.sale_id,
        item.product_id,
        item.quantity,
        item.final_amount,
        item.cogs_amount,
        item.net_profit
      from public.business_sale_items item
      join realized_sales sale
        on sale.id = item.sale_id
      where item.user_id = current_user_id
        and item.workspace_id = p_workspace_id
    ),

    realized_item_totals as (
      select
        item.sale_id,
        coalesce(sum(item.final_amount), 0) as gross_revenue,
        coalesce(sum(item.net_profit), 0) as base_profit
      from realized_items item
      group by item.sale_id
    ),

    realized_refunds as (
      select
        sale_return.sale_id,
        coalesce(sum(sale_return.refund_amount), 0) as refunds
      from public.business_sale_returns sale_return
      join realized_sales sale
        on sale.id = sale_return.sale_id
      where sale_return.user_id = current_user_id
        and sale_return.workspace_id = p_workspace_id
      group by sale_return.sale_id
    ),

    restockable_quantity_by_item as (
      select
        return_item.sale_item_id,
        coalesce(
          sum(return_item.quantity) filter (
            where return_item.restockable
          ),
          0
        ) as quantity
      from public.business_sale_return_items return_item
      join realized_items item
        on item.id = return_item.sale_item_id
      where return_item.user_id = current_user_id
        and return_item.workspace_id = p_workspace_id
      group by return_item.sale_item_id
    ),

    returned_quantity_by_item as (
      select
        return_item.sale_item_id,
        coalesce(sum(return_item.quantity), 0) as quantity
      from public.business_sale_return_items return_item
      join realized_items item
        on item.id = return_item.sale_item_id
      where return_item.user_id = current_user_id
        and return_item.workspace_id = p_workspace_id
      group by return_item.sale_item_id
    ),

    recovered_cogs_by_sale as (
      select
        item.sale_id,
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
      from realized_items item
      left join restockable_quantity_by_item returned
        on returned.sale_item_id = item.id
      group by item.sale_id
    ),

    realized_financials as (
      select
        sale.id as sale_id,
        sale.sale_date,
        greatest(
          coalesce(items.gross_revenue, 0)
          + coalesce(sale.delivery_fee, 0)
          - coalesce(refunds.refunds, 0),
          0
        ) as revenue,
        (
          coalesce(items.base_profit, 0)
          + coalesce(sale.delivery_fee, 0)
          - coalesce(sale.delivery_cost, 0)
          - coalesce(refunds.refunds, 0)
          + coalesce(recovered.recovered_cogs, 0)
        ) as profit
      from realized_sales sale
      left join realized_item_totals items
        on items.sale_id = sale.id
      left join realized_refunds refunds
        on refunds.sale_id = sale.id
      left join recovered_cogs_by_sale recovered
        on recovered.sale_id = sale.id
    ),

    period_expenses as (
      select expense.*
      from public.business_expenses expense
      where expense.user_id = current_user_id
        and expense.workspace_id = p_workspace_id
        and (
          range_start is null
          or expense.spent_at::date >= range_start
        )
        and expense.spent_at::date <= range_end
    ),

    received_value as (
      select
        coalesce(
          sum(
            case
              when payment.status = 'PAID'
                then payment.amount
              when payment.status = 'REFUNDED'
                then -payment.amount
              else 0
            end
          ),
          0
        ) as value
      from public.business_payments payment
      where payment.user_id = current_user_id
        and payment.workspace_id = p_workspace_id
        and payment.paid_at is not null
        and (
          range_start is null
          or payment.paid_at::date >= range_start
        )
        and payment.paid_at::date <= range_end
    ),

    summary_values as (
      select
        coalesce(
          (select sum(revenue) from realized_financials),
          0
        ) as revenue,
        coalesce(
          (select sum(profit) from realized_financials),
          0
        ) as sale_profit,
        coalesce(
          (select sum(amount) from period_expenses),
          0
        ) as expenses,
        (
          select count(*)::integer
          from realized_sales
        ) as sales_count,
        (
          select value
          from received_value
        ) as received,
        (
          select value
          from receivable_value
        ) as receivable
    ),

    expense_categories as (
      select
        expense.category,
        case expense.category
          when 'gasolina' then 'Gasolina'
          when 'embalagem' then 'Embalagem'
          when 'anuncios' then 'Anúncios'
          when 'entrega' then 'Entrega'
          when 'manutencao' then 'Manutenção'
          when 'taxas' then 'Taxas'
          else 'Outras'
        end as label,
        round(sum(expense.amount)::numeric, 2) as value
      from period_expenses expense
      group by expense.category
    ),

    product_values as (
      select
        item.product_id,
        coalesce(product.name, 'Produto') as name,
        sum(
          greatest(
            item.quantity
            - least(
                item.quantity,
                coalesce(returned.quantity, 0)
              ),
            0
          )
        ) as units,
        sum(
          case
            when item.quantity > 0 then
              item.final_amount
              * (
                  greatest(
                    item.quantity
                    - least(
                        item.quantity,
                        coalesce(returned.quantity, 0)
                      ),
                    0
                  )::numeric
                  / item.quantity
                )
            else 0
          end
        ) as revenue,
        sum(
          case
            when item.quantity > 0 then
              item.net_profit
              * (
                  greatest(
                    item.quantity
                    - least(
                        item.quantity,
                        coalesce(returned.quantity, 0)
                      ),
                    0
                  )::numeric
                  / item.quantity
                )
            else 0
          end
        ) as profit
      from realized_items item
      left join returned_quantity_by_item returned
        on returned.sale_item_id = item.id
      left join public.business_products product
        on product.id = item.product_id
        and product.user_id = current_user_id
        and product.workspace_id = p_workspace_id
      group by item.product_id, product.name
      having sum(
        greatest(
          item.quantity
          - least(
              item.quantity,
              coalesce(returned.quantity, 0)
            ),
          0
        )
      ) > 0
    ),

    series_source as (
      select
        case
          when range_start = date_trunc('month', range_end)::date
            then to_char(sale.sale_date::date, 'YYYY-MM-DD')
          else to_char(sale.sale_date::date, 'YYYY-MM')
        end as key,
        sale.revenue,
        sale.profit,
        0::numeric as expenses
      from realized_financials sale

      union all

      select
        case
          when range_start = date_trunc('month', range_end)::date
            then to_char(expense.spent_at::date, 'YYYY-MM-DD')
          else to_char(expense.spent_at::date, 'YYYY-MM')
        end as key,
        0::numeric as revenue,
        0::numeric as profit,
        expense.amount as expenses
      from period_expenses expense
    ),

    series_aggregated as (
      select
        source.key,
        coalesce(sum(source.revenue), 0) as revenue,
        coalesce(sum(source.profit), 0) as profit,
        coalesce(sum(source.expenses), 0) as expenses
      from series_source source
      group by source.key
    ),

    series_keys as (
      select
        to_char(day_value::date, 'YYYY-MM-DD') as key
      from generate_series(
        range_start::timestamp,
        range_end::timestamp,
        interval '1 day'
      ) day_value
      where range_start = date_trunc('month', range_end)::date

      union

      select
        to_char(month_value::date, 'YYYY-MM') as key
      from generate_series(
        date_trunc('month', range_start::timestamp),
        date_trunc('month', range_end::timestamp),
        interval '1 month'
      ) month_value
      where range_start != date_trunc('month', range_end)::date
    ),

    series_rows as (
      select
        keys.key,
        case
          when range_start = date_trunc('month', range_end)::date then
            substring(keys.key from 9 for 2)
            || '/'
            || substring(keys.key from 6 for 2)
          else
            case substring(keys.key from 6 for 2)
              when '01' then 'jan'
              when '02' then 'fev'
              when '03' then 'mar'
              when '04' then 'abr'
              when '05' then 'mai'
              when '06' then 'jun'
              when '07' then 'jul'
              when '08' then 'ago'
              when '09' then 'set'
              when '10' then 'out'
              when '11' then 'nov'
              else 'dez'
            end
        end as label,
        round(coalesce(aggregated.revenue, 0)::numeric, 2) as revenue,
        round(coalesce(aggregated.profit, 0)::numeric, 2) as profit,
        round(coalesce(aggregated.expenses, 0)::numeric, 2) as expenses,
        round((coalesce(aggregated.profit, 0) - coalesce(aggregated.expenses, 0))::numeric, 2) as result
      from series_keys keys
      left join series_aggregated aggregated
        on aggregated.key = keys.key
    )

    select jsonb_build_object(
      'summary',
      (
        select jsonb_build_object(
          'revenue', round(summary.revenue::numeric, 2),
          'saleProfit', round(summary.sale_profit::numeric, 2),
          'expenses', round(summary.expenses::numeric, 2),
          'result', round((summary.sale_profit - summary.expenses)::numeric, 2),
          'margin',
          case
            when summary.revenue > 0 then
              ((summary.sale_profit - summary.expenses) / summary.revenue) * 100
            else 0
          end,
          'salesCount', summary.sales_count,
          'ticket',
          case
            when summary.sales_count > 0 then
              round((summary.revenue / summary.sales_count)::numeric, 2)
            else 0
          end,
          'received', round(summary.received::numeric, 2),
          'receivable', round(summary.receivable::numeric, 2)
        )
        from summary_values summary
      ),

      'series',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'key', row.key,
              'label', row.label,
              'revenue', row.revenue,
              'profit', row.profit,
              'expenses', row.expenses,
              'result', row.result
            )
            order by row.key
          )
          from series_rows row
        ),
        '[]'::jsonb
      ),

      'expensesByCategory',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'category', row.category,
              'label', row.label,
              'value', row.value
            )
            order by row.value desc
          )
          from expense_categories row
        ),
        '[]'::jsonb
      ),

      'topByRevenue',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'productId', ranked.product_id,
              'name', ranked.name,
              'units', ranked.units,
              'revenue', round(ranked.revenue::numeric, 2),
              'profit', round(ranked.profit::numeric, 2)
            )
            order by ranked.revenue desc
          )
          from (select * from product_values order by revenue desc limit 5) ranked
        ),
        '[]'::jsonb
      ),

      'topByProfit',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'productId', ranked.product_id,
              'name', ranked.name,
              'units', ranked.units,
              'revenue', round(ranked.revenue::numeric, 2),
              'profit', round(ranked.profit::numeric, 2)
            )
            order by ranked.profit desc
          )
          from (select * from product_values order by profit desc limit 5) ranked
        ),
        '[]'::jsonb
      )
    )
  );
end;
$function$;
