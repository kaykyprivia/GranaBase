-- Scalable Business reads: customers, expenses and customer lookup.

create index if not exists idx_business_customers_workspace_created_at
  on public.business_customers(user_id, workspace_id, created_at desc, id desc);

create index if not exists idx_business_sales_workspace_customer_date
  on public.business_sales(user_id, workspace_id, customer_id, sale_date desc, id desc)
  where customer_id is not null;

create index if not exists idx_business_expenses_workspace_spent_at
  on public.business_expenses(user_id, workspace_id, spent_at desc, created_at desc, id desc);


create or replace function public.get_business_customers_page(
  p_workspace_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null
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
        coalesce(sum(item.final_amount), 0) as gross_value
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
      where nullif(trim(coalesce(p_search, '')), '') is null
        or position(
          lower(trim(p_search))
          in lower(
            coalesce(name, '') || ' ' ||
            coalesce(whatsapp, '') || ' ' ||
            coalesce(notes, '')
          )
        ) > 0
    ),
    counts as (
      select count(*)::integer as total_count
      from filtered
    ),
    page_rows as (
      select *
      from filtered
      order by created_at desc, id desc
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
            order by created_at desc, id desc
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


create or replace function public.get_business_expenses_page(
  p_workspace_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_category text default 'all',
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
  resolved_page integer := greatest(coalesce(p_page, 1), 1);
  resolved_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  if p_category is null
    or p_category not in (
      'all',
      'gasolina',
      'embalagem',
      'anuncios',
      'entrega',
      'manutencao',
      'taxas',
      'outras'
    )
  then
    raise exception 'Categoria de despesa invalida';
  end if;

  return (
    with filtered as (
      select expense.*
      from public.business_expenses expense
      where expense.user_id = current_user_id
        and expense.workspace_id = p_workspace_id
        and (
          p_category = 'all'
          or expense.category = p_category
        )
        and (
          p_start_date is null
          or expense.spent_at >= p_start_date
        )
        and (
          p_end_date is null
          or expense.spent_at < (p_end_date + 1)
        )
        and (
          nullif(trim(coalesce(p_search, '')), '') is null
          or position(
            lower(trim(p_search))
            in lower(
              coalesce(expense.description, '') || ' ' ||
              coalesce(expense.notes, '') || ' ' ||
              coalesce(expense.category, '') || ' ' ||
              case expense.category
                when 'gasolina' then 'gasolina'
                when 'embalagem' then 'embalagem'
                when 'anuncios' then 'anuncios'
                when 'entrega' then 'entrega'
                when 'manutencao' then 'manutencao'
                when 'taxas' then 'taxas'
                when 'outras' then 'outras'
                else ''
              end
            )
          ) > 0
        )
    ),
    counts as (
      select count(*)::integer as total_count
      from filtered
    ),
    page_rows as (
      select *
      from filtered
      order by spent_at desc, created_at desc, id desc
      offset (resolved_page - 1) * resolved_page_size
      limit resolved_page_size
    ),
    category_totals as (
      select
        category,
        sum(amount) as category_total
      from filtered
      group by category
    ),
    top_category as (
      select
        category,
        category_total
      from category_totals
      order by
        category_total desc,
        case category
          when 'gasolina' then 1
          when 'embalagem' then 2
          when 'anuncios' then 3
          when 'entrega' then 4
          when 'manutencao' then 5
          when 'taxas' then 6
          else 7
        end
      limit 1
    ),
    summary as (
      select
        count(*)::integer as count,
        coalesce(sum(amount), 0) as total,
        coalesce(avg(amount), 0) as average
      from filtered
    )
    select jsonb_build_object(
      'rows',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(page_rows)
            order by spent_at desc, created_at desc, id desc
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
        'count', (select count from summary),
        'total', (select total from summary),
        'average', (select average from summary),
        'top_category',
        (select category from top_category),
        'top_category_amount',
        coalesce(
          (select category_total from top_category),
          0
        )
      )
    )
  );
end;
$$;


create or replace function public.search_business_customers(
  p_workspace_id uuid,
  p_search text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_limit integer := least(
    greatest(coalesce(p_limit, 20), 1),
    50
  );
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  return (
    select coalesce(
      jsonb_agg(
        to_jsonb(customer)
        order by customer.name, customer.id
      ),
      '[]'::jsonb
    )
    from (
      select
        id,
        user_id,
        workspace_id,
        name,
        whatsapp,
        notes,
        created_at,
        updated_at
      from public.business_customers
      where user_id = current_user_id
        and workspace_id = p_workspace_id
        and (
          nullif(trim(coalesce(p_search, '')), '') is null
          or position(
            lower(trim(p_search))
            in lower(
              coalesce(name, '') || ' ' ||
              coalesce(whatsapp, '')
            )
          ) > 0
        )
      order by name, id
      limit resolved_limit
    ) customer
  );
end;
$$;


revoke execute on function public.get_business_customers_page(
  uuid, integer, integer, text
) from public, anon;

revoke execute on function public.get_business_expenses_page(
  uuid, integer, integer, text, date, date, text
) from public, anon;

revoke execute on function public.search_business_customers(
  uuid, text, integer
) from public, anon;


grant execute on function public.get_business_customers_page(
  uuid, integer, integer, text
) to authenticated;

grant execute on function public.get_business_expenses_page(
  uuid, integer, integer, text, date, date, text
) to authenticated;

grant execute on function public.search_business_customers(
  uuid, text, integer
) to authenticated;
