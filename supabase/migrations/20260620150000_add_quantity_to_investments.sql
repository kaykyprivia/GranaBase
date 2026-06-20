-- Optional quantity (shares/cotas/coins) per investment, used together with
-- `ticker` and the live quote APIs to compute current position value and
-- gain/loss. Numeric with decimals to support fractional crypto holdings.
alter table public.investments add column if not exists quantity numeric(18,8);
