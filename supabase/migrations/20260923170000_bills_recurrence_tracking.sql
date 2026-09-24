-- ============================================================
-- Rastreia bills recorrentes geradas
-- ============================================================

alter table public.bills
  add column if not exists generated_from_bill_id uuid
  references public.bills(id) on delete cascade;

create index if not exists idx_bills_generated_from
  on public.bills(generated_from_bill_id);
