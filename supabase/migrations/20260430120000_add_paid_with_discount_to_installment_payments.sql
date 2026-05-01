-- Allow discounted installment settlements while keeping overdue as a derived UI-only state.

update public.installment_payments
set
  status = case
    when status = 'paid' then 'paid'
    when status = 'paid_with_discount' then 'paid_with_discount'
    else 'pending'
  end,
  paid_at = case
    when status in ('paid', 'paid_with_discount') then paid_at
    else null
  end;

alter table public.installment_payments
  alter column status set default 'pending';

alter table public.installment_payments
  drop constraint if exists installment_payments_status_check;

alter table public.installment_payments
  add constraint installment_payments_status_check
  check (status in ('pending', 'paid', 'paid_with_discount'));
