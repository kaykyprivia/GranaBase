-- Scalable product search for inventory adjustment flows.

create or replace function public.search_business_inventory_products(
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

  return (
    select coalesce(
      jsonb_agg(
        to_jsonb(result)
        order by result.name asc, result.product_id asc
      ),
      '[]'::jsonb
    )
    from (
      select
        inventory.product_id,
        inventory.name,
        inventory.sku,
        inventory.barcode,
        inventory.image_url,
        inventory.default_sale_price,
        inventory.minimum_stock,
        inventory.on_hand,
        inventory.reserved,
        inventory.available,
        inventory.in_transit,
        inventory.inventory_value,
        inventory.average_unit_cost,
        inventory.estimated_profit,
        inventory.active,
        inventory.created_at,
        inventory.updated_at,
        inventory.last_movement_at,
        inventory.total_purchased,
        inventory.total_received,
        inventory.total_sold,
        inventory.user_id,
        inventory.workspace_id
      from public.business_inventory_summary inventory
      where inventory.user_id = current_user_id
        and inventory.workspace_id = p_workspace_id
        and inventory.active = true
        and (
          resolved_search = ''
          or position(
            resolved_search
            in translate(
              lower(
                coalesce(inventory.name, '') || ' ' ||
                coalesce(inventory.sku, '') || ' ' ||
                coalesce(inventory.barcode, '') || ' ' ||
                inventory.product_id::text
              ),
              'áàâãäéèêëíìîïóòôõöúùûüç',
              'aaaaaeeeeiiiiooooouuuuc'
            )
          ) > 0
        )
      order by
        case
          when resolved_search <> ''
            and translate(
              lower(inventory.name),
              'áàâãäéèêëíìîïóòôõöúùûüç',
              'aaaaaeeeeiiiiooooouuuuc'
            ) like resolved_search || '%'
          then 0
          else 1
        end,
        inventory.name asc,
        inventory.product_id asc
      limit resolved_limit
    ) result
  );
end;
$$;

revoke execute on function public.search_business_inventory_products(
  uuid,
  text,
  integer
) from public, anon;

grant execute on function public.search_business_inventory_products(
  uuid,
  text,
  integer
) to authenticated;