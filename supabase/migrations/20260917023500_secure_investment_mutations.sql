create or replace function public.create_investment(
  p_name text,
  p_amount numeric,
  p_investment_type text,
  p_invested_at date,
  p_ticker text default null,
  p_quantity numeric default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  investment_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Nome do investimento e obrigatorio';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor do investimento deve ser positivo';
  end if;

  if nullif(trim(p_investment_type), '') is null then
    raise exception 'Tipo do investimento e obrigatorio';
  end if;


  if p_invested_at is null then
    raise exception 'Data do investimento e obrigatoria';
  end if;


  insert into public.investments (
    user_id,
    name,
    amount,
    investment_type,
    invested_at,
    ticker,
    quantity,
    notes
  )
  values (
    current_user_id,
    trim(p_name),
    round(p_amount, 2),
    trim(p_investment_type),
    p_invested_at,
    nullif(upper(trim(p_ticker)), ''),
    p_quantity,
    nullif(trim(p_notes), '')
  )
  returning id into investment_id;

  return investment_id;
end;
$$;

revoke all on function public.create_investment(text, numeric, text, date, text, numeric, text) from public;
grant execute on function public.create_investment(text, numeric, text, date, text, numeric, text) to authenticated;


create or replace function public.update_investment(
  p_investment_id uuid,
  p_name text,
  p_amount numeric,
  p_investment_type text,
  p_invested_at date,
  p_ticker text default null,
  p_quantity numeric default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_investment_id is null then
    raise exception 'Investimento invalido';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Nome do investimento e obrigatorio';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor do investimento deve ser positivo';
  end if;

  if nullif(trim(p_investment_type), '') is null then
    raise exception 'Tipo do investimento e obrigatorio';
  end if;


  if p_invested_at is null then
    raise exception 'Data do investimento e obrigatoria';
  end if;


  update public.investments
  set
    name = trim(p_name),
    amount = round(p_amount, 2),
    investment_type = trim(p_investment_type),
    invested_at = p_invested_at,
    ticker = nullif(upper(trim(p_ticker)), ''),
    quantity = p_quantity,
    notes = nullif(trim(p_notes), '')
  where id = p_investment_id
    and user_id = current_user_id
    and sold_at is null;

  get diagnostics affected_rows = row_count;

  if affected_rows = 0 then
    raise exception 'Investimento nao encontrado ou sem permissao';
  end if;
end;
$$;

revoke all on function public.update_investment(uuid, text, numeric, text, date, text, numeric, text) from public;
grant execute on function public.update_investment(uuid, text, numeric, text, date, text, numeric, text) to authenticated;


create or replace function public.delete_investment(
  p_investment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_investment_id is null then
    raise exception 'Investimento invalido';
  end if;

  delete from public.investments
  where id = p_investment_id
    and user_id = current_user_id;

  get diagnostics affected_rows = row_count;

  if affected_rows = 0 then
    raise exception 'Investimento nao encontrado ou sem permissao';
  end if;
end;
$$;

revoke all on function public.delete_investment(uuid) from public;
grant execute on function public.delete_investment(uuid) to authenticated;


create or replace function public.sell_investment(
  p_investment_id uuid,
  p_sold_amount numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  affected_rows integer;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_investment_id is null then
    raise exception 'Investimento invalido';
  end if;

  if p_sold_amount is not null and p_sold_amount < 0 then
    raise exception 'Valor da venda nao pode ser negativo';
  end if;

  update public.investments
  set
    sold_at = now(),
    sold_amount = case
      when p_sold_amount is null then null
      else round(p_sold_amount, 2)
    end
  where id = p_investment_id
    and user_id = current_user_id
    and sold_at is null;

  get diagnostics affected_rows = row_count;

  if affected_rows = 0 then
    raise exception 'Investimento nao encontrado, ja vendido ou sem permissao';
  end if;
end;
$$;

revoke all on function public.sell_investment(uuid, numeric) from public;
grant execute on function public.sell_investment(uuid, numeric) to authenticated;
