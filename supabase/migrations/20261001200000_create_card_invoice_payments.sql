-- Faturas de cartao: agrupa gastos no credito por (cartao, mes de vencimento)
-- e permite marcar a fatura toda como paga de uma vez.
--
-- Regras:
--   - reference_month e SEMPRE o 1o dia do mes de card_due_date
--     (ex: card_due_date = 2026-10-28 -> reference_month = 2026-10-01)
--   - quando a fatura e paga, gastos daquele cartao/mes ganham invoice_payment_id
--   - gastos sem card_id NAO entram em fatura (usuario escolheu "Sem cartao")

-- ============================================================
-- 1. Tabela card_invoice_payments
-- ============================================================
create table if not exists public.card_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.user_cards(id) on delete cascade,
  reference_month date not null,
  amount numeric not null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint card_invoice_payments_unique unique (user_id, card_id, reference_month),
  constraint card_invoice_payments_reference_month_first_day
    check (extract(day from reference_month) = 1),
  constraint card_invoice_payments_amount_non_negative check (amount >= 0)
);

create index if not exists idx_card_invoice_payments_user
  on public.card_invoice_payments(user_id, reference_month desc);

create index if not exists idx_card_invoice_payments_card
  on public.card_invoice_payments(card_id, reference_month desc);

alter table public.card_invoice_payments enable row level security;

drop policy if exists "users can read own card invoices" on public.card_invoice_payments;
create policy "users can read own card invoices"
  on public.card_invoice_payments for select
  using (auth.uid() = user_id);

-- ============================================================
-- 2. Coluna invoice_payment_id em expense_entries
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expense_entries'
      and column_name = 'invoice_payment_id'
  ) then
    alter table public.expense_entries
      add column invoice_payment_id uuid
      references public.card_invoice_payments(id) on delete set null;
  end if;
end $$;

create index if not exists idx_expense_invoice_payment
  on public.expense_entries(invoice_payment_id)
  where invoice_payment_id is not null;

create index if not exists idx_expense_card_due_month
  on public.expense_entries(card_id, card_due_date)
  where card_id is not null and card_due_date is not null;
