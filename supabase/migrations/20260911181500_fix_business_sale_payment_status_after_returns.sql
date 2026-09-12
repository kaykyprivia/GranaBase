-- Keep sale payment status aligned with the net sale value after returns.

create or replace function public.business_refresh_sale_payment_status(
  p_sale_id uuid,
  p_user_id uuid,
  p_workspace_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  gross_sale_total numeric(12,2);
  refund_total numeric(12,2);
  net_sale_total numeric(12,2);
  paid_total numeric(12,2);
  refunded_total numeric(12,2);
  net_paid numeric(12,2);
  next_status text;
begin
  select coalesce(sum(final_amount), 0)
    into gross_sale_total
  from public.business_sale_items
  where sale_id = p_sale_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  select coalesce(sum(refund_amount), 0)
    into refund_total
  from public.business_sale_returns
  where sale_id = p_sale_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  net_sale_total := greatest(
    round(gross_sale_total - refund_total, 2),
    0
  );

  select
    coalesce(sum(amount) filter (where status = 'PAID'), 0),
    coalesce(sum(amount) filter (where status = 'REFUNDED'), 0)
    into paid_total, refunded_total
  from public.business_payments
  where sale_id = p_sale_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  net_paid := round(paid_total - refunded_total, 2);

  next_status := case
    when refunded_total > 0
      and net_sale_total <= 0
      and net_paid <= 0
      then 'REFUNDED'
    when net_paid <= 0
      then 'PENDING'
    when net_paid < net_sale_total
      then 'PARTIALLY_PAID'
    else 'PAID'
  end;

  update public.business_sales
  set payment_status = next_status
  where id = p_sale_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  return next_status;
end;
$$;
-- Recalculate existing sales so historical payment statuses are corrected immediately.
with financials as (
  select
    sale.id,
    greatest(
      round(
        coalesce(items.gross_sale_total, 0) -
        coalesce(returns.refund_total, 0),
        2
      ),
      0
    ) as net_sale_total,
    round(
      coalesce(payments.paid_total, 0) -
      coalesce(payments.refunded_total, 0),
      2
    ) as net_paid,
    coalesce(payments.refunded_total, 0) as refunded_total
  from public.business_sales sale
  left join (
    select
      sale_id,
      sum(final_amount) as gross_sale_total
    from public.business_sale_items
    group by sale_id
  ) items on items.sale_id = sale.id
  left join (
    select
      sale_id,
      sum(refund_amount) as refund_total
    from public.business_sale_returns
    group by sale_id
  ) returns on returns.sale_id = sale.id
  left join (
    select
      sale_id,
      coalesce(sum(amount) filter (where status = 'PAID'), 0) as paid_total,
      coalesce(sum(amount) filter (where status = 'REFUNDED'), 0) as refunded_total
    from public.business_payments
    group by sale_id
  ) payments on payments.sale_id = sale.id
)
update public.business_sales sale
set payment_status = case
  when financials.refunded_total > 0
    and financials.net_sale_total <= 0
    and financials.net_paid <= 0
    then 'REFUNDED'
  when financials.net_paid <= 0
    then 'PENDING'
  when financials.net_paid < financials.net_sale_total
    then 'PARTIALLY_PAID'
  else 'PAID'
end
from financials
where financials.id = sale.id;