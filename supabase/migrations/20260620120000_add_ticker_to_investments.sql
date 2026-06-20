-- Optional ticker/symbol per investment, used to fetch live quotes (Brapi for
-- stocks/FIIs, CoinGecko for crypto) without guessing from the free-text name.
alter table public.investments add column if not exists ticker text;
