-- ── PRICING MODULE (modules/spreadsheets/pricing) ──────────────────────────
-- Tabelas isoladas do modulo de Planilha Inteligente de Precificacao.
-- Sem FK para tabelas existentes (income_entries, expense_entries, etc.) --
-- o modulo e independente do resto do app por design.

-- ── INSUMOS ─────────────────────────────────────────────────────────────
create table if not exists public.pricing_insumos (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  nome               text not null,
  unidade_medida     text not null check (unidade_medida in ('g', 'kg', 'ml', 'L', 'un')),
  preco_compra       numeric(12,2) not null check (preco_compra >= 0),
  quantidade_compra  numeric(12,3) not null default 1 check (quantidade_compra > 0),
  peso_bruto         numeric(12,3) check (peso_bruto > 0),
  peso_liquido       numeric(12,3) check (peso_liquido > 0),
  fornecedor         text,
  categoria          text,
  observacao         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint pricing_insumos_peso_liquido_valido check (
    peso_liquido is null or peso_bruto is null or peso_liquido <= peso_bruto
  )
);

alter table public.pricing_insumos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pricing_insumos' and policyname = 'users can select own pricing_insumos') then
    create policy "users can select own pricing_insumos" on public.pricing_insumos for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_insumos' and policyname = 'users can insert own pricing_insumos') then
    create policy "users can insert own pricing_insumos" on public.pricing_insumos for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_insumos' and policyname = 'users can update own pricing_insumos') then
    create policy "users can update own pricing_insumos" on public.pricing_insumos for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_insumos' and policyname = 'users can delete own pricing_insumos') then
    create policy "users can delete own pricing_insumos" on public.pricing_insumos for delete using (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_pricing_insumos_updated_at on public.pricing_insumos;
create trigger set_pricing_insumos_updated_at
  before update on public.pricing_insumos
  for each row execute procedure public.set_updated_at();

create index if not exists idx_pricing_insumos_user on public.pricing_insumos(user_id);

-- ── PRODUTOS ────────────────────────────────────────────────────────────
create table if not exists public.pricing_produtos (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  nome                     text not null,
  categoria                text,
  rendimento_porcoes       numeric(12,3) not null default 1 check (rendimento_porcoes > 0),
  despesas_variaveis_pct   numeric(5,2) not null default 0 check (despesas_variaveis_pct between 0 and 100),
  despesas_fixas_pct       numeric(5,2) not null default 0 check (despesas_fixas_pct between 0 and 100),
  impostos_pct             numeric(5,2) not null default 0 check (impostos_pct between 0 and 100),
  margem_desejada_pct      numeric(5,2) not null default 0 check (margem_desejada_pct between 0 and 100),
  preco_praticado          numeric(12,2) check (preco_praticado >= 0),
  observacao               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.pricing_produtos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pricing_produtos' and policyname = 'users can select own pricing_produtos') then
    create policy "users can select own pricing_produtos" on public.pricing_produtos for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_produtos' and policyname = 'users can insert own pricing_produtos') then
    create policy "users can insert own pricing_produtos" on public.pricing_produtos for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_produtos' and policyname = 'users can update own pricing_produtos') then
    create policy "users can update own pricing_produtos" on public.pricing_produtos for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_produtos' and policyname = 'users can delete own pricing_produtos') then
    create policy "users can delete own pricing_produtos" on public.pricing_produtos for delete using (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_pricing_produtos_updated_at on public.pricing_produtos;
create trigger set_pricing_produtos_updated_at
  before update on public.pricing_produtos
  for each row execute procedure public.set_updated_at();

create index if not exists idx_pricing_produtos_user on public.pricing_produtos(user_id);

-- ── FICHA TECNICA (produto <-> insumo) ─────────────────────────────────
create table if not exists public.pricing_produto_insumos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  produto_id        uuid not null references public.pricing_produtos(id) on delete cascade,
  insumo_id         uuid not null references public.pricing_insumos(id) on delete cascade,
  quantidade_usada  numeric(12,3) not null check (quantidade_usada > 0),
  created_at        timestamptz not null default now(),
  unique (produto_id, insumo_id)
);

alter table public.pricing_produto_insumos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pricing_produto_insumos' and policyname = 'users can select own pricing_produto_insumos') then
    create policy "users can select own pricing_produto_insumos" on public.pricing_produto_insumos for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_produto_insumos' and policyname = 'users can insert own pricing_produto_insumos') then
    create policy "users can insert own pricing_produto_insumos" on public.pricing_produto_insumos for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_produto_insumos' and policyname = 'users can update own pricing_produto_insumos') then
    create policy "users can update own pricing_produto_insumos" on public.pricing_produto_insumos for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_produto_insumos' and policyname = 'users can delete own pricing_produto_insumos') then
    create policy "users can delete own pricing_produto_insumos" on public.pricing_produto_insumos for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_pricing_produto_insumos_produto on public.pricing_produto_insumos(produto_id);
create index if not exists idx_pricing_produto_insumos_insumo on public.pricing_produto_insumos(insumo_id);

-- ── CONFIGURACOES (1 linha por usuario) ────────────────────────────────
create table if not exists public.pricing_configuracoes (
  user_id                          uuid primary key references auth.users(id) on delete cascade,
  impostos_pct_padrao              numeric(5,2) not null default 0 check (impostos_pct_padrao between 0 and 100),
  despesas_fixas_pct_padrao        numeric(5,2) not null default 0 check (despesas_fixas_pct_padrao between 0 and 100),
  despesas_variaveis_pct_padrao    numeric(5,2) not null default 0 check (despesas_variaveis_pct_padrao between 0 and 100),
  margem_desejada_pct_padrao       numeric(5,2) not null default 0 check (margem_desejada_pct_padrao between 0 and 100),
  regime_tributario                text check (regime_tributario in ('simples_nacional', 'lucro_presumido', 'lucro_real', 'mei', 'outro')),
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now()
);

alter table public.pricing_configuracoes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pricing_configuracoes' and policyname = 'users can select own pricing_configuracoes') then
    create policy "users can select own pricing_configuracoes" on public.pricing_configuracoes for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_configuracoes' and policyname = 'users can insert own pricing_configuracoes') then
    create policy "users can insert own pricing_configuracoes" on public.pricing_configuracoes for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_configuracoes' and policyname = 'users can update own pricing_configuracoes') then
    create policy "users can update own pricing_configuracoes" on public.pricing_configuracoes for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pricing_configuracoes' and policyname = 'users can delete own pricing_configuracoes') then
    create policy "users can delete own pricing_configuracoes" on public.pricing_configuracoes for delete using (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_pricing_configuracoes_updated_at on public.pricing_configuracoes;
create trigger set_pricing_configuracoes_updated_at
  before update on public.pricing_configuracoes
  for each row execute procedure public.set_updated_at();
