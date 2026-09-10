create or replace function public.advance_business_sale_status(
  p_sale_id uuid,
  p_next_status text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_row public.business_sales%rowtype;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_next_status is null or p_next_status not in ('SEPARATED', 'SHIPPED') then
    raise exception 'Status operacional invalido';
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
    'next_status', p_next_status
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    sale_row.workspace_id,
    'advance_business_sale_status',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  if p_next_status = 'SEPARATED' and sale_row.order_status <> 'RESERVED' then
    raise exception 'Venda precisa estar reservada para ser separada';
  end if;

  if p_next_status = 'SHIPPED' and sale_row.order_status <> 'SEPARATED' then
    raise exception 'Venda precisa estar separada para ser enviada';
  end if;

  update public.business_sales
  set order_status = p_next_status
  where id = sale_row.id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    sale_row.workspace_id,
    'sale',
    sale_row.id,
    case when p_next_status = 'SEPARATED' then 'sale_separated' else 'sale_shipped' end,
    jsonb_build_object('from_status', sale_row.order_status, 'to_status', p_next_status)
  );

  response := jsonb_build_object(
    'sale_id', sale_row.id,
    'status', p_next_status
  );

  perform public.business_complete_idempotency(
    current_user_id,
    sale_row.workspace_id,
    'advance_business_sale_status',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

revoke execute on function public.advance_business_sale_status(uuid, text, text) from public, anon;
grant execute on function public.advance_business_sale_status(uuid, text, text) to authenticated;
