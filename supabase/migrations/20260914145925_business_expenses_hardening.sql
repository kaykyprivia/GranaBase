-- Harden business expenses and add safe update/delete workflows.

create or replace function public.record_business_expense(
  p_workspace_id uuid,
  p_description text,
  p_category text,
  p_amount numeric,
  p_idempotency_key text,
  p_spent_at date default current_date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  resolved_spent_at date := coalesce(p_spent_at, current_date);
  expense_id uuid;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  request_hash := md5(
    jsonb_build_object(
      'workspace_id', p_workspace_id,
      'description', p_description,
      'category', p_category,
      'amount', p_amount,
      'spent_at', p_spent_at,
      'notes', p_notes
    )::text
  );

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'record_business_expense',
    p_idempotency_key,
    request_hash
  );

  if existing_response is not null then
    return existing_response;
  end if;

  if nullif(trim(p_description), '') is null then
    raise exception 'Descricao da despesa obrigatoria';
  end if;

  if char_length(trim(p_description)) > 200 then
    raise exception 'Descricao da despesa excede 200 caracteres';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor da despesa deve ser maior que zero';
  end if;

  if p_category is null
    or p_category not in (
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

  if resolved_spent_at > current_date then
    raise exception 'Data da despesa nao pode estar no futuro';
  end if;

  if p_notes is not null
    and char_length(trim(p_notes)) > 2000
  then
    raise exception 'Observacoes da despesa excedem 2000 caracteres';
  end if;

  insert into public.business_expenses (
    user_id,
    workspace_id,
    description,
    category,
    amount,
    spent_at,
    notes
  )
  values (
    current_user_id,
    p_workspace_id,
    trim(p_description),
    p_category,
    round(p_amount, 2),
    resolved_spent_at,
    nullif(trim(p_notes), '')
  )
  returning id into expense_id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    p_workspace_id,
    'business_expense',
    expense_id,
    'expense_recorded',
    jsonb_build_object(
      'description', trim(p_description),
      'category', p_category,
      'amount', round(p_amount, 2),
      'spent_at', resolved_spent_at
    )
  );

  response := jsonb_build_object(
    'expense_id', expense_id,
    'amount', round(p_amount, 2)
  );

  perform public.business_complete_idempotency(
    current_user_id,
    p_workspace_id,
    'record_business_expense',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;


create or replace function public.update_business_expense(
  p_workspace_id uuid,
  p_expense_id uuid,
  p_description text,
  p_category text,
  p_amount numeric,
  p_idempotency_key text,
  p_spent_at date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  expense_row public.business_expenses%rowtype;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  request_hash := md5(
    jsonb_build_object(
      'workspace_id', p_workspace_id,
      'expense_id', p_expense_id,
      'description', p_description,
      'category', p_category,
      'amount', p_amount,
      'spent_at', p_spent_at,
      'notes', p_notes
    )::text
  );

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'update_business_expense',
    p_idempotency_key,
    request_hash
  );

  if existing_response is not null then
    return existing_response;
  end if;

  select *
    into expense_row
  from public.business_expenses
  where id = p_expense_id
    and user_id = current_user_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Despesa nao encontrada';
  end if;

  if nullif(trim(p_description), '') is null then
    raise exception 'Descricao da despesa obrigatoria';
  end if;

  if char_length(trim(p_description)) > 200 then
    raise exception 'Descricao da despesa excede 200 caracteres';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor da despesa deve ser maior que zero';
  end if;

  if p_category is null
    or p_category not in (
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

  if p_spent_at is null then
    raise exception 'Data da despesa obrigatoria';
  end if;

  if p_spent_at > current_date then
    raise exception 'Data da despesa nao pode estar no futuro';
  end if;

  if p_notes is not null
    and char_length(trim(p_notes)) > 2000
  then
    raise exception 'Observacoes da despesa excedem 2000 caracteres';
  end if;

  update public.business_expenses
  set
    description = trim(p_description),
    category = p_category,
    amount = round(p_amount, 2),
    spent_at = p_spent_at,
    notes = nullif(trim(p_notes), '')
  where id = expense_row.id
    and user_id = current_user_id
    and workspace_id = p_workspace_id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    p_workspace_id,
    'business_expense',
    expense_row.id,
    'expense_updated',
    jsonb_build_object(
      'before',
      jsonb_build_object(
        'description', expense_row.description,
        'category', expense_row.category,
        'amount', expense_row.amount,
        'spent_at', expense_row.spent_at,
        'notes', expense_row.notes
      ),
      'after',
      jsonb_build_object(
        'description', trim(p_description),
        'category', p_category,
        'amount', round(p_amount, 2),
        'spent_at', p_spent_at,
        'notes', nullif(trim(p_notes), '')
      )
    )
  );

  response := jsonb_build_object(
    'expense_id', expense_row.id,
    'amount', round(p_amount, 2)
  );

  perform public.business_complete_idempotency(
    current_user_id,
    p_workspace_id,
    'update_business_expense',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;


create or replace function public.delete_business_expense(
  p_workspace_id uuid,
  p_expense_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  expense_row public.business_expenses%rowtype;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(
    p_workspace_id,
    current_user_id
  );

  request_hash := md5(
    jsonb_build_object(
      'workspace_id', p_workspace_id,
      'expense_id', p_expense_id
    )::text
  );

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'delete_business_expense',
    p_idempotency_key,
    request_hash
  );

  if existing_response is not null then
    return existing_response;
  end if;

  select *
    into expense_row
  from public.business_expenses
  where id = p_expense_id
    and user_id = current_user_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Despesa nao encontrada';
  end if;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    p_workspace_id,
    'business_expense',
    expense_row.id,
    'expense_deleted',
    jsonb_build_object(
      'description', expense_row.description,
      'category', expense_row.category,
      'amount', expense_row.amount,
      'spent_at', expense_row.spent_at,
      'notes', expense_row.notes,
      'created_at', expense_row.created_at,
      'updated_at', expense_row.updated_at
    )
  );

  delete from public.business_expenses
  where id = expense_row.id
    and user_id = current_user_id
    and workspace_id = p_workspace_id;

  response := jsonb_build_object(
    'expense_id', expense_row.id,
    'deleted', true
  );

  perform public.business_complete_idempotency(
    current_user_id,
    p_workspace_id,
    'delete_business_expense',
    p_idempotency_key,
    response
  );

  return response;
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
  resolved_page_size integer :=
    least(greatest(coalesce(p_page_size, 25), 1), 100);
  resolved_start_date date := p_start_date;
  resolved_end_date date :=
    least(coalesce(p_end_date, current_date), current_date);
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

  if resolved_start_date is not null
    and resolved_start_date > resolved_end_date
  then
    raise exception 'Intervalo de despesas invalido';
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
          resolved_start_date is null
          or expense.spent_at >= resolved_start_date
        )
        and expense.spent_at <= resolved_end_date
        and (
          resolved_search = ''
          or position(
            resolved_search
            in translate(
              lower(
                coalesce(expense.description, '') || ' ' ||
                coalesce(expense.notes, '') || ' ' ||
                coalesce(expense.category, '')
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


revoke execute on function public.record_business_expense(
  uuid, text, text, numeric, text, date, text
) from public, anon;

revoke execute on function public.update_business_expense(
  uuid, uuid, text, text, numeric, text, date, text
) from public, anon;

revoke execute on function public.delete_business_expense(
  uuid, uuid, text
) from public, anon;

revoke execute on function public.get_business_expenses_page(
  uuid, integer, integer, text, date, date, text
) from public, anon;


grant execute on function public.record_business_expense(
  uuid, text, text, numeric, text, date, text
) to authenticated;

grant execute on function public.update_business_expense(
  uuid, uuid, text, text, numeric, text, date, text
) to authenticated;

grant execute on function public.delete_business_expense(
  uuid, uuid, text
) to authenticated;

grant execute on function public.get_business_expenses_page(
  uuid, integer, integer, text, date, date, text
) to authenticated;
