-- ============================================================
-- Fecha RLS de writes diretos nas tabelas Personal
-- Mantém apenas SELECT via client; writes passam só via RPC
-- ============================================================

-- income_entries
drop policy if exists "users can insert own income" on public.income_entries;
drop policy if exists "users can update own income" on public.income_entries;
drop policy if exists "users can delete own income" on public.income_entries;

-- expense_entries
drop policy if exists "users can insert own expenses" on public.expense_entries;
drop policy if exists "users can update own expenses" on public.expense_entries;
drop policy if exists "users can delete own expenses" on public.expense_entries;

-- bills
drop policy if exists "users can insert own bills" on public.bills;
drop policy if exists "users can update own bills" on public.bills;
drop policy if exists "users can delete own bills" on public.bills;

-- financial_goals
drop policy if exists "users can insert own goals" on public.financial_goals;
drop policy if exists "users can update own goals" on public.financial_goals;
drop policy if exists "users can delete own goals" on public.financial_goals;

-- receivables
drop policy if exists "users can insert own receivables" on public.receivables;
drop policy if exists "users can update own receivables" on public.receivables;
drop policy if exists "users can delete own receivables" on public.receivables;

-- installments
drop policy if exists "users can insert own installments" on public.installments;
drop policy if exists "users can update own installments" on public.installments;
drop policy if exists "users can delete own installments" on public.installments;

-- installment_payments
drop policy if exists "users can insert own installment_payments" on public.installment_payments;
drop policy if exists "users can update own installment_payments" on public.installment_payments;
drop policy if exists "users can delete own installment_payments" on public.installment_payments;

-- investments
drop policy if exists "users can insert own investments" on public.investments;
drop policy if exists "users can update own investments" on public.investments;
drop policy if exists "users can delete own investments" on public.investments;
