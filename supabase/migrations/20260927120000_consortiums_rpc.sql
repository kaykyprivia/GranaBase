-- ============================================================
-- CONSORTIUMS: RPCs de edicao/exclusao + fechamento de writes
-- ============================================================

-- 1. RPC: update_consortium_payment
create or replace function public.update_consortium_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_due_date date,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_payment record;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_payment_id is null then
    raise exception 'p_payment_id obrigatorio';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor invalido';
  end if;

  if p_due_date is null then
    raise exception 'Data de vencimento obrigatoria';
  end if;

  select id, user_id, consortium_id, status
  into target_payment
  from public.consortium_payments
  where id = p_payment_id
  for update;

  if target_payment.id is null then
    raise exception 'Parcela nao encontrada';
  end if;

  if target_payment.user_id <> current_user_id then
    raise exception 'Sem permissao';
  end if;

  if target_payment.status <> 'pending' then
    raise exception 'Apenas parcelas pendentes podem ser editadas';
  end if;

  update public.consortium_payments
  set
    amount = p_amount,
    due_date = p_due_date,
    notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_payment_id;

  -- Sincroniza current_installment_amount do consortium
  update public.consortiums
  set current_installment_amount = p_amount
  where id = target_payment.consortium_id
    and user_id = current_user_id;
end;
$$;

revoke all on function public.update_consortium_payment(uuid, numeric, date, text)
  from public, anon;

grant execute on function public.update_consortium_payment(uuid, numeric, date, text)
  to authenticated;

comment on function public.update_consortium_payment(uuid, numeric, date, text) is
  'Edita parcela pendente e sincroniza valor do consorcio.';

-- 2. RPC: update_consortium
create or replace function public.update_consortium(
  p_consortium_id uuid,
  p_name text,
  p_current_installment_amount numeric
)
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

  if p_consortium_id is null then
    raise exception 'p_consortium_id obrigatorio';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Nome obrigatorio';
  end if;

  if p_current_installment_amount is null or p_current_installment_amount <= 0 then
    raise exception 'Valor da parcela invalido';
  end if;

  update public.consortiums
  set
    name = trim(p_name),
    current_installment_amount = p_current_installment_amount
  where id = p_consortium_id
    and user_id = current_user_id;

  if not found then
    raise exception 'Consorcio nao encontrado';
  end if;
end;
$$;

revoke all on function public.update_consortium(uuid, text, numeric)
  from public, anon;

grant execute on function public.update_consortium(uuid, text, numeric)
  to authenticated;

comment on function public.update_consortium(uuid, text, numeric) is
  'Atualiza nome e valor da parcela do consorcio.';

-- 3. RPC: delete_consortium
create or replace function public.delete_consortium(
  p_consortium_id uuid
)
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

  if p_consortium_id is null then
    raise exception 'p_consortium_id obrigatorio';
  end if;

  delete from public.consortiums
  where id = p_consortium_id
    and user_id = current_user_id;

  if not found then
    raise exception 'Consorcio nao encontrado';
  end if;
end;
$$;

revoke all on function public.delete_consortium(uuid)
  from public, anon;

grant execute on function public.delete_consortium(uuid)
  to authenticated;

comment on function public.delete_consortium(uuid) is
  'Exclui consorcio e pagamentos (cascade).';

-- ============================================================
-- Fechar policies de write direto
-- ============================================================

drop policy if exists "users can insert own consortiums" on public.consortiums;
drop policy if exists "users can update own consortiums" on public.consortiums;
drop policy if exists "users can delete own consortiums" on public.consortiums;

drop policy if exists "users can insert own consortium payments" on public.consortium_payments;
drop policy if exists "users can update own consortium payments" on public.consortium_payments;
drop policy if exists "users can delete own consortium payments" on public.consortium_payments;

drop policy if exists "users can insert own dividends" on public.investment_dividends;
drop policy if exists "users can update own dividends" on public.investment_dividends;
drop policy if exists "users can delete own dividends" on public.investment_dividends;
