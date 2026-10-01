-- RPCs de fatura de cartao
--   list_my_card_invoices()          -> lista faturas pendentes por (cartao, mes)
--   pay_card_invoice(card, mes)      -> cria registro + marca todos os gastos do mes
--   unpay_card_invoice(payment_id)   -> desfaz (deleta registro + limpa gastos)

-- ============================================================
-- 1. list_my_card_invoices
-- ============================================================
create or replace function public.list_my_card_invoices()
returns table (
  card_id uuid,
  card_name text,
  card_due_day integer,
  reference_month date,
  total_amount numeric,
  expense_count bigint,
  is_paid boolean,
  paid_at timestamptz,
  invoice_payment_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  with gastos as (
    select
      e.card_id,
      e.card_due_date,
      date_trunc('month', e.card_due_date)::date as ref_month,
      sum(e.amount)::numeric as total,
      count(*)::bigint as cnt,
      max(e.invoice_payment_id::text)::uuid as inv_id
    from public.expense_entries e
    where e.user_id = current_user_id
      and e.card_id is not null
      and e.card_due_date is not null
    group by e.card_id, date_trunc('month', e.card_due_date)::date
  )
  select
    g.card_id,
    c.name,
    c.due_day,
    g.ref_month,
    g.total,
    g.cnt,
    (g.inv_id is not null) as is_paid,
    p.paid_at,
    g.inv_id
  from gastos g
  join public.user_cards c on c.id = g.card_id
  left join public.card_invoice_payments p on p.id = g.inv_id
  order by g.ref_month desc, c.name asc;
end;
$$;

revoke all on function public.list_my_card_invoices() from public, anon;
grant execute on function public.list_my_card_invoices() to authenticated;

-- ============================================================
-- 2. pay_card_invoice
-- ============================================================
create or replace function public.pay_card_invoice(
  p_card_id uuid,
  p_reference_month date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  v_total numeric;
  v_count bigint;
  v_payment_id uuid;
  v_normalized_month date;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_card_id is null then
    raise exception 'p_card_id obrigatorio';
  end if;
  if p_reference_month is null then
    raise exception 'p_reference_month obrigatorio';
  end if;

  -- normaliza para o 1o dia do mes
  v_normalized_month := date_trunc('month', p_reference_month)::date;

  -- confirma que o cartao e do usuario
  if not exists (
    select 1 from public.user_cards
    where id = p_card_id and user_id = current_user_id
  ) then
    raise exception 'Cartao nao encontrado';
  end if;

  -- se ja foi paga, retorna a existente
  select id into v_payment_id
  from public.card_invoice_payments
  where user_id = current_user_id
    and card_id = p_card_id
    and reference_month = v_normalized_month;

  if v_payment_id is not null then
    return v_payment_id;
  end if;

  -- calcula total + count dos gastos daquele mes/cartao ainda NAO pagos
  select coalesce(sum(amount), 0), count(*)
  into v_total, v_count
  from public.expense_entries
  where user_id = current_user_id
    and card_id = p_card_id
    and card_due_date is not null
    and date_trunc('month', card_due_date)::date = v_normalized_month
    and invoice_payment_id is null;

  if v_count = 0 then
    raise exception 'Nenhum gasto pendente nesta fatura';
  end if;

  -- cria o registro de pagamento
  insert into public.card_invoice_payments (
    user_id, card_id, reference_month, amount
  ) values (
    current_user_id, p_card_id, v_normalized_month, v_total
  )
  returning id into v_payment_id;

  -- vincula todos os gastos do mes a esse pagamento
  update public.expense_entries
  set invoice_payment_id = v_payment_id
  where user_id = current_user_id
    and card_id = p_card_id
    and card_due_date is not null
    and date_trunc('month', card_due_date)::date = v_normalized_month
    and invoice_payment_id is null;

  return v_payment_id;
end;
$$;

revoke all on function public.pay_card_invoice(uuid, date) from public, anon;
grant execute on function public.pay_card_invoice(uuid, date) to authenticated;

-- ============================================================
-- 3. unpay_card_invoice
-- ============================================================
create or replace function public.unpay_card_invoice(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_payment_id is null then
    raise exception 'p_payment_id obrigatorio';
  end if;

  -- confirma que o pagamento e do usuario
  if not exists (
    select 1 from public.card_invoice_payments
    where id = p_payment_id and user_id = current_user_id
  ) then
    raise exception 'Fatura nao encontrada';
  end if;

  -- limpa os gastos vinculados (FK ja faz on delete set null, mas fazemos explicito)
  update public.expense_entries
  set invoice_payment_id = null
  where user_id = current_user_id
    and invoice_payment_id = p_payment_id;

  delete from public.card_invoice_payments
  where id = p_payment_id and user_id = current_user_id;
end;
$$;

revoke all on function public.unpay_card_invoice(uuid) from public, anon;
grant execute on function public.unpay_card_invoice(uuid) to authenticated;
