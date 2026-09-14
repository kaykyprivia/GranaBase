-- Align replenishment semantics with suggested reorder quantity.
-- Products only require replenishment when suggested_reorder_quantity is greater than zero.

create or replace function public.get_business_inventory_page(
  p_workspace_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_filter text default 'all',
  p_sort text default 'name',
  p_search text default null,
  p_window_days integer default 30,
  p_target_days integer default 30
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
  resolved_window_days integer := coalesce(p_window_days, 30);
  resolved_target_days integer := coalesce(p_target_days, 30);
  resolved_search text :=
    translate(
      lower(trim(coalesce(p_search, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    );
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  if p_filter is null
    or p_filter not in (
      'all',
      'available',
      'low',
      'empty',
      'reserved',
      'in_transit',
      'reorder',
      'no_recent_turnover'
    )
  then
    raise exception 'Filtro de estoque invalido';
  end if;

  if p_sort is null
    or p_sort not in (
      'name',
      'stock_desc',
      'stock_asc',
      'capital_desc',
      'cost_desc',
      'recent',
      'coverage_asc',
      'velocity_desc',
      'reorder_desc'
    )
  then
    raise exception 'Ordenacao de estoque invalida';
  end if;

  if resolved_window_days < 7 or resolved_window_days > 180 then
    raise exception 'Janela de inteligencia deve estar entre 7 e 180 dias';
  end if;

  if resolved_target_days < 7 or resolved_target_days > 180 then
    raise exception 'Horizonte de reposicao deve estar entre 7 e 180 dias';
  end if;

  return (
    with recent_movement_stats as (
      select
        movement.product_id,
        coalesce(
          sum(
            case
              when movement.movement_type = 'SALE_OUT'
                then abs(movement.quantity_delta)
              else 0
            end
          ),
          0
        )::integer as gross_sold,
        coalesce(
          sum(
            case
              when movement.movement_type = 'CUSTOMER_RETURN'
                then greatest(movement.quantity_delta, 0)
              else 0
            end
          ),
          0
        )::integer as customer_returns
      from public.business_inventory_movements movement
      where movement.user_id = current_user_id
        and movement.workspace_id = p_workspace_id
        and movement.movement_type in ('SALE_OUT', 'CUSTOMER_RETURN')
        and movement.created_at >= (
          current_date - (resolved_window_days - 1)
        )::timestamptz
      group by movement.product_id
    ),
    last_sale_stats as (
      select
        movement.product_id,
        max(movement.created_at) as last_sale_at
      from public.business_inventory_movements movement
      where movement.user_id = current_user_id
        and movement.workspace_id = p_workspace_id
        and movement.movement_type = 'SALE_OUT'
      group by movement.product_id
    ),
    inventory_base as (
      select
        inventory.*,
        coalesce(recent.gross_sold, 0)::integer as gross_sold_window,
        coalesce(recent.customer_returns, 0)::integer as customer_returns_window,
        greatest(
          coalesce(recent.gross_sold, 0) -
          coalesce(recent.customer_returns, 0),
          0
        )::integer as net_outflow_window,
        last_sale.last_sale_at,
        least(
          resolved_window_days,
          greatest(
            1,
            (current_date - inventory.created_at::date + 1)
          )
        )::integer as observation_days
      from public.business_inventory_summary inventory
      left join recent_movement_stats recent
        on recent.product_id = inventory.product_id
      left join last_sale_stats last_sale
        on last_sale.product_id = inventory.product_id
      where inventory.user_id = current_user_id
        and inventory.workspace_id = p_workspace_id
    ),
    velocity as (
      select
        inventory_base.*,
        (
          inventory_base.net_outflow_window::numeric /
          nullif(inventory_base.observation_days, 0)
        ) as daily_outflow_raw
      from inventory_base
    ),
    scored as (
      select
        velocity.*,
        round(velocity.daily_outflow_raw, 4) as average_daily_outflow,
        case
          when velocity.daily_outflow_raw > 0 then
            round(velocity.available / velocity.daily_outflow_raw, 1)
          else null
        end as coverage_days,
        case
          when velocity.daily_outflow_raw > 0 then
            round(
              (velocity.available + velocity.in_transit) /
              velocity.daily_outflow_raw,
              1
            )
          else null
        end as projected_coverage_days,
        greatest(
          velocity.minimum_stock,
          ceil(
            velocity.daily_outflow_raw * resolved_target_days
          )::integer
        )::integer as target_stock,
        case
          when velocity.last_sale_at is null then null
          else (current_date - velocity.last_sale_at::date)::integer
        end as days_since_last_sale
      from velocity
    ),
    replenishment as (
      select
        scored.*,
        greatest(
          scored.target_stock -
          scored.available -
          scored.in_transit,
          0
        )::integer as suggested_reorder_quantity
      from scored
    ),
    classified as (
      select
        replenishment.*,
        case
          when replenishment.available = 0
            and replenishment.in_transit = 0
            then 'out_of_stock'

          when replenishment.suggested_reorder_quantity > 0
            and (
              (
                replenishment.minimum_stock > 0
                and replenishment.available <= replenishment.minimum_stock
              )
              or (
                replenishment.coverage_days is not null
                and replenishment.coverage_days <= 7
              )
            )
            then 'reorder_now'

          when replenishment.available = 0
            or replenishment.suggested_reorder_quantity > 0
            then 'attention'

          when replenishment.on_hand > 0
            and replenishment.gross_sold_window = 0
            and replenishment.observation_days >= resolved_window_days
            then 'no_recent_turnover'

          else 'healthy'
        end as intelligence_status
      from replenishment
    ),
    filtered as (
      select *
      from classified
      where (
        p_filter = 'all'
        or (p_filter = 'available' and available > 0)
        or (
          p_filter = 'low'
          and minimum_stock > 0
          and available <= minimum_stock
        )
        or (
          p_filter = 'empty'
          and on_hand = 0
          and in_transit = 0
        )
        or (p_filter = 'reserved' and reserved > 0)
        or (p_filter = 'in_transit' and in_transit > 0)
        or (
          p_filter = 'reorder'
          and suggested_reorder_quantity > 0
        )
        or (
          p_filter = 'no_recent_turnover'
          and intelligence_status = 'no_recent_turnover'
        )
      )
      and (
        resolved_search = ''
        or position(
          resolved_search
          in translate(
            lower(
              coalesce(name, '') || ' ' ||
              coalesce(sku, '') || ' ' ||
              coalesce(barcode, '') || ' ' ||
              product_id::text
            ),
            'áàâãäéèêëíìîïóòôõöúùûüç',
            'aaaaaeeeeiiiiooooouuuuc'
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
      order by
        case when p_sort = 'stock_desc' then available end desc nulls last,
        case when p_sort = 'stock_asc' then available end asc nulls last,
        case when p_sort = 'capital_desc' then inventory_value end desc nulls last,
        case when p_sort = 'cost_desc' then average_unit_cost end desc nulls last,
        case when p_sort = 'recent' then last_movement_at end desc nulls last,
        case when p_sort = 'coverage_asc' then coverage_days end asc nulls last,
        case when p_sort = 'velocity_desc' then average_daily_outflow end desc nulls last,
        case when p_sort = 'reorder_desc' then suggested_reorder_quantity end desc nulls last,
        case when p_sort = 'name' then lower(name) end asc nulls last,
        lower(name) asc,
        product_id asc
      offset (resolved_page - 1) * resolved_page_size
      limit resolved_page_size
    ),
    inventory_summary as (
      select
        coalesce(sum(inventory_value), 0)::numeric(14,2) as inventory_value,
        count(*) filter (where on_hand > 0)::integer as products_in_stock,
        coalesce(sum(available), 0)::integer as available_units,
        count(*) filter (
          where minimum_stock > 0
            and available <= minimum_stock
        )::integer as low_stock_products,
        count(*) filter (
          where on_hand = 0
            and in_transit = 0
        )::integer as out_of_stock_products,
        coalesce(sum(in_transit), 0)::integer as in_transit_units,
        count(*) filter (
          where intelligence_status in ('out_of_stock', 'reorder_now')
            and suggested_reorder_quantity > 0
        )::integer as reorder_now_products,
        count(*) filter (
          where intelligence_status = 'attention'
        )::integer as attention_products,
        count(*) filter (
          where intelligence_status = 'no_recent_turnover'
        )::integer as no_recent_turnover_products,
        coalesce(sum(suggested_reorder_quantity), 0)::integer
          as suggested_reorder_units
      from classified
    )
    select jsonb_build_object(
      'rows',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(page_rows)
            order by
              case when p_sort = 'stock_desc' then available end desc nulls last,
              case when p_sort = 'stock_asc' then available end asc nulls last,
              case when p_sort = 'capital_desc' then inventory_value end desc nulls last,
              case when p_sort = 'cost_desc' then average_unit_cost end desc nulls last,
              case when p_sort = 'recent' then last_movement_at end desc nulls last,
              case when p_sort = 'coverage_asc' then coverage_days end asc nulls last,
              case when p_sort = 'velocity_desc' then average_daily_outflow end desc nulls last,
              case when p_sort = 'reorder_desc' then suggested_reorder_quantity end desc nulls last,
              case when p_sort = 'name' then lower(name) end asc nulls last,
              lower(name) asc,
              product_id asc
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
      'window_days',
      resolved_window_days,
      'target_days',
      resolved_target_days,
      'summary',
      (
        select jsonb_build_object(
          'inventory_value', inventory_value,
          'products_in_stock', products_in_stock,
          'available_units', available_units,
          'low_stock_products', low_stock_products,
          'out_of_stock_products', out_of_stock_products,
          'in_transit_units', in_transit_units,
          'reorder_now_products', reorder_now_products,
          'attention_products', attention_products,
          'no_recent_turnover_products', no_recent_turnover_products,
          'suggested_reorder_units', suggested_reorder_units
        )
        from inventory_summary
      )
    )
  );
end;
$$;

revoke execute on function public.get_business_inventory_page(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  integer,
  integer
) from public, anon;

grant execute on function public.get_business_inventory_page(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  integer,
  integer
) to authenticated;