-- ── Vender ativo: preservar historico em vez de deletar ────────────────────
-- Hoje "Vender ativo" deleta a linha do investimento (sem registro de venda).
-- Adiciona campos opcionais para marcar como vendido e guardar o valor da
-- venda, permitindo apurar ganho/perda realizado sem perder o historico.
alter table public.investments add column if not exists sold_at timestamptz;
alter table public.investments add column if not exists sold_amount numeric(14,2);

create index if not exists idx_investments_user_sold on public.investments(user_id, sold_at);

-- ── PROVENTOS (dividendos, JCP, rendimentos recebidos) ─────────────────────
create table if not exists public.investment_dividends (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ticker        text not null,
  asset_name    text,
  amount        numeric(14,2) not null check (amount > 0),
  per_share     numeric(14,6),
  payment_date  date not null,
  label         text not null default 'Dividendo' check (label in ('Dividendo', 'JCP', 'Rendimento', 'Outro')),
  source        text not null default 'manual' check (source in ('manual', 'yahoo')),
  notes         text,
  created_at    timestamptz not null default now()
);

alter table public.investment_dividends enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'investment_dividends' and policyname = 'users can select own dividends') then
    create policy "users can select own dividends" on public.investment_dividends for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'investment_dividends' and policyname = 'users can insert own dividends') then
    create policy "users can insert own dividends" on public.investment_dividends for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'investment_dividends' and policyname = 'users can update own dividends') then
    create policy "users can update own dividends" on public.investment_dividends for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'investment_dividends' and policyname = 'users can delete own dividends') then
    create policy "users can delete own dividends" on public.investment_dividends for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_investment_dividends_user_ticker on public.investment_dividends(user_id, ticker);
create index if not exists idx_investment_dividends_user_date on public.investment_dividends(user_id, payment_date);
