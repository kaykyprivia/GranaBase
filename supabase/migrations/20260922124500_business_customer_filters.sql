drop function if exists public.get_business_customers_page(
  uuid,
  integer,
  integer,
  text
);

create or replace function public.get_business_customers_page(
  p_workspace_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_purchase_filter text default 'all',
  p_contact_filter text default 'all',
  p_sort text default 'recent'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_page integer := greatest(coalesce(p_page, 1), 1);
  resolved_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  resolved_purchase_filter text := case
    when p_purchase_filter in ('buyers', 'recurring', 'no_orders') then p_purchase_filter
    else 'all'
  end;
  resolved_contact_filter text := case
    when p_contact_filter in ('with_whatsapp', 'without_whatsapp') then p_contact_filter
    else 'all'
  end;
  resolved_sort text := case
    when p_sort in ('name', 'orders_desc', 'value_desc', 'last_purchase_desc') then p_sort
    else 'recent'
  end;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  return (
    with gross_by_sale as (
      select
        sale.id as sale_id,
        sale.customer_id,
        sale.sale_date,
        coalesce(sum(item.final_amount), 0) + coalesce(max(sale.delivery_fee), 0) as gross_value
      from public.business_sales sale
      left join public.business_sale_items item
        on item.sale_id = sale.id
        and item.user_id = current_user_id
        and item.workspace_id = p_workspace_id
      where sale.user_id = current_user_id
        and sale.workspace_id = p_workspace_id
        and sale.customer_id is not null
        and sale.order_status <> 'CANCELLED'
      group by sale.id, sale.customer_id, sale.sale_date
    ),
    refunds_by_sale as (
      select
        sale_return.sale_id,
        coalesce(sum(sale_return.refund_amount), 0) as refund_value
      from public.business_sale_returns sale_return
      where sale_return.user_id = current_user_id
        and sale_return.workspace_id = p_workspace_id
      group by sale_return.sale_id
    ),
    sale_financials as (
      select
        sale.sale_id,
        sale.customer_id,
        sale.sale_date,
        greatest(
          sale.gross_value - coalesce(refund.refund_value, 0),
          0
        ) as net_value
      from gross_by_sale sale
      left join refunds_by_sale refund
        on refund.sale_id = sale.sale_id
    ),
    customer_metrics as (
      select
        sale.customer_id,
        count(*)::integer as orders,
        coalesce(sum(sale.net_value), 0) as total_purchased,
        max(sale.sale_date) as last_purchase
      from sale_financials sale
      group by sale.customer_id
    ),
    base as (
      select
        customer.id,
        customer.user_id,
        customer.workspace_id,
        customer.name,
        customer.whatsapp,
        customer.notes,
        customer.created_at,
        customer.updated_at,
        coalesce(metrics.orders, 0)::integer as orders,
        coalesce(metrics.total_purchased, 0) as total_purchased,
        metrics.last_purchase
      from public.business_customers customer
      left join customer_metrics metrics
        on metrics.customer_id = customer.id
      where customer.user_id = current_user_id
        and customer.workspace_id = p_workspace_id
    ),
    filtered as (
      select *
      from base
      where (
          nullif(trim(coalesce(p_search, '')), '') is null
          or position(
            lower(trim(p_search))
            in lower(
              coalesce(name, '') || ' ' ||
              coalesce(whatsapp, '') || ' ' ||
              coalesce(notes, '')
            )
          ) > 0
        )
        and (
          resolved_purchase_filter = 'all'
          or (resolved_purchase_filter = 'buyers' and orders > 0)
          or (resolved_purchase_filter = 'recurring' and orders >= 2)
          or (resolved_purchase_filter = 'no_orders' and orders = 0)
        )
        and (
          resolved_contact_filter = 'all'
          or (
            resolved_contact_filter = 'with_whatsapp'
            and nullif(trim(coalesce(whatsapp, '')), '') is not null
          )
          or (
            resolved_contact_filter = 'without_whatsapp'
            and nullif(trim(coalesce(whatsapp, '')), '') is null
          )
        )
    ),
    counts as (
      select count(*)::integer as total_count
      from filtered
    ),
    page_rows as (
      select *
      from filtered
      order by
        case when resolved_sort = 'name' then lower(name) end asc,
        case when resolved_sort = 'orders_desc' then orders end desc,
        case when resolved_sort = 'value_desc' then total_purchased end desc,
        case when resolved_sort = 'last_purchase_desc' then last_purchase end desc nulls last,
        created_at desc,
        id desc
      offset (resolved_page - 1) * resolved_page_size
      limit resolved_page_size
    ),
    summary as (
      select
        count(*)::integer as total,
        count(*) filter (where orders > 0)::integer as buyers,
        count(*) filter (where orders >= 2)::integer as recurring,
        coalesce(sum(total_purchased), 0) as total_sold
      from base
    )
    select jsonb_build_object(
      'rows',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(page_rows)
            order by
              case when resolved_sort = 'name' then lower(name) end asc,
              case when resolved_sort = 'orders_desc' then orders end desc,
              case when resolved_sort = 'value_desc' then total_purchased end desc,
              case when resolved_sort = 'last_purchase_desc' then last_purchase end desc nulls last,
              created_at desc,
              id desc
          )
          from page_rows
        ),
        '[]'::jsonb
      ),
      'total_count',
      (select total_count from counts),
      'page',
      resolved_page,
      'page_size',
      resolved_page_size,
      'total_pages',
      case
        when (select total_count from counts) = 0 then 0
        else ceil(
          (select total_count from counts)::numeric /
          resolved_page_size
        )::integer
      end,
      'summary',
      jsonb_build_object(
        'total', (select total from summary),
        'buyers', (select buyers from summary),
        'recurring', (select recurring from summary),
        'total_sold', (select total_sold from summary)
      )
    )
  );
end;
$$;

revoke all on function public.get_business_customers_page(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text
) from public, anon;

grant execute on function public.get_business_customers_page(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text
) to authenticated;

comment on function public.get_business_customers_page(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text
) is 'Lista clientes do negocio com busca, filtros, ordenacao e paginacao.';
