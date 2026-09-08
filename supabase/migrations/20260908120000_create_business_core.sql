-- Business core: production-grade transactional foundation for the Negocio module.
-- The personal finance module remains untouched. Critical operational writes go through RPCs.

create table if not exists public.business_workspaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Meu negocio',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.business_operation_idempotency (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  workspace_id     uuid not null,
  operation        text not null,
  idempotency_key  text not null,
  request_hash     text not null,
  status           text not null default 'PROCESSING' check (status in ('PROCESSING', 'COMPLETED')),
  response         jsonb,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (user_id, workspace_id, operation, idempotency_key),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade
);

create table if not exists public.business_products (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  workspace_id        uuid not null,
  name                text not null,
  sku                 text,
  barcode             text,
  image_url           text,
  default_sale_price  numeric(12,2) check (default_sale_price >= 0),
  minimum_stock       integer not null default 0 check (minimum_stock >= 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, workspace_id),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade
);

create unique index if not exists uq_business_products_workspace_sku
  on public.business_products(workspace_id, sku)
  where sku is not null;

create table if not exists public.business_purchase_orders (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  workspace_id           uuid not null,
  purchase_date          date not null default current_date,
  expected_arrival_date  date,
  origin                 text,
  product_subtotal       numeric(12,2) not null default 0 check (product_subtotal >= 0),
  shipping_cost          numeric(12,2) not null default 0 check (shipping_cost >= 0),
  additional_costs       numeric(12,2) not null default 0 check (additional_costs >= 0),
  total_cost             numeric(12,2) not null default 0 check (total_cost >= 0),
  status                 text not null default 'PURCHASED' check (
    status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')
  ),
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, workspace_id),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade
);

create table if not exists public.business_purchase_items (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  workspace_id          uuid not null,
  purchase_order_id     uuid not null,
  product_id            uuid not null,
  quantity_ordered      integer not null check (quantity_ordered > 0),
  quantity_received     integer not null default 0 check (quantity_received >= 0),
  unit_purchase_cost    numeric(12,2) not null check (unit_purchase_cost >= 0),
  allocated_extra_cost  numeric(12,2) not null default 0 check (allocated_extra_cost >= 0),
  real_unit_cost        numeric(12,2) not null check (real_unit_cost >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, workspace_id),
  check (quantity_received <= quantity_ordered),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade,
  foreign key (purchase_order_id, user_id, workspace_id)
    references public.business_purchase_orders(id, user_id, workspace_id) on delete cascade,
  foreign key (product_id, user_id, workspace_id)
    references public.business_products(id, user_id, workspace_id) on delete restrict
);

create table if not exists public.business_inventory_lots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  workspace_id        uuid not null,
  product_id          uuid not null,
  purchase_item_id    uuid,
  received_quantity   integer not null check (received_quantity > 0),
  remaining_quantity  integer not null check (remaining_quantity >= 0),
  reserved_quantity   integer not null default 0 check (reserved_quantity >= 0),
  unit_cost           numeric(12,2) not null check (unit_cost >= 0),
  received_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, workspace_id),
  check (remaining_quantity <= received_quantity),
  check (reserved_quantity <= remaining_quantity),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade,
  foreign key (product_id, user_id, workspace_id)
    references public.business_products(id, user_id, workspace_id) on delete restrict,
  foreign key (purchase_item_id, user_id, workspace_id)
    references public.business_purchase_items(id, user_id, workspace_id) on delete restrict
);

create table if not exists public.business_customers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workspace_id  uuid not null,
  name          text not null,
  whatsapp      text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, workspace_id),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade
);

create table if not exists public.business_sales (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null,
  customer_id     uuid,
  order_status    text not null default 'DRAFT' check (
    order_status in ('DRAFT', 'RESERVED', 'SEPARATED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED')
  ),
  payment_status  text not null default 'PENDING' check (
    payment_status in ('PENDING', 'PARTIALLY_PAID', 'PAID', 'REFUNDED')
  ),
  sale_date       timestamptz not null default now(),
  delivered_at    timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, workspace_id),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade,
  foreign key (customer_id, user_id, workspace_id)
    references public.business_customers(id, user_id, workspace_id) on delete restrict
);

create table if not exists public.business_sale_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  workspace_id      uuid not null,
  sale_id           uuid not null,
  product_id        uuid not null,
  quantity          integer not null check (quantity > 0),
  unit_sale_price   numeric(12,2) not null check (unit_sale_price >= 0),
  gross_amount      numeric(12,2) not null check (gross_amount >= 0),
  discount_amount   numeric(12,2) not null default 0 check (discount_amount >= 0),
  final_amount      numeric(12,2) not null check (final_amount >= 0),
  platform_fee      numeric(12,2) not null default 0 check (platform_fee >= 0),
  shipping_cost     numeric(12,2) not null default 0 check (shipping_cost >= 0),
  additional_costs  numeric(12,2) not null default 0 check (additional_costs >= 0),
  cogs_amount       numeric(12,2) not null default 0 check (cogs_amount >= 0),
  gross_profit      numeric(12,2) not null default 0,
  net_profit        numeric(12,2) not null default 0,
  margin_pct        numeric(8,4),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, workspace_id),
  check (discount_amount <= gross_amount),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade,
  foreign key (sale_id, user_id, workspace_id)
    references public.business_sales(id, user_id, workspace_id) on delete cascade,
  foreign key (product_id, user_id, workspace_id)
    references public.business_products(id, user_id, workspace_id) on delete restrict
);

create table if not exists public.business_sale_item_allocations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  workspace_id       uuid not null,
  sale_item_id       uuid not null,
  inventory_lot_id   uuid not null,
  quantity           integer not null check (quantity > 0),
  returned_quantity  integer not null default 0 check (returned_quantity >= 0),
  unit_cost          numeric(12,2) not null check (unit_cost >= 0),
  status             text not null default 'RESERVED' check (
    status in ('RESERVED', 'RELEASED', 'CONSUMED', 'RETURNED')
  ),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (sale_item_id, inventory_lot_id),
  check (returned_quantity <= quantity),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade,
  foreign key (sale_item_id, user_id, workspace_id)
    references public.business_sale_items(id, user_id, workspace_id) on delete cascade,
  foreign key (inventory_lot_id, user_id, workspace_id)
    references public.business_inventory_lots(id, user_id, workspace_id) on delete restrict
);

create table if not exists public.business_inventory_movements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  workspace_id      uuid not null,
  product_id        uuid not null,
  inventory_lot_id  uuid,
  movement_type     text not null check (
    movement_type in ('PURCHASE_RECEIPT', 'SALE_OUT', 'CUSTOMER_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'LOSS', 'DAMAGED')
  ),
  quantity_delta    integer not null check (quantity_delta <> 0),
  unit_cost         numeric(12,2) not null default 0 check (unit_cost >= 0),
  total_cost        numeric(12,2) not null default 0 check (total_cost >= 0),
  reference_type    text,
  reference_id      uuid,
  notes             text,
  created_at        timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade,
  foreign key (product_id, user_id, workspace_id)
    references public.business_products(id, user_id, workspace_id) on delete restrict,
  foreign key (inventory_lot_id, user_id, workspace_id)
    references public.business_inventory_lots(id, user_id, workspace_id) on delete restrict
);

create table if not exists public.business_payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null,
  sale_id         uuid not null,
  amount          numeric(12,2) not null check (amount > 0),
  payment_method  text,
  status          text not null default 'PAID' check (status in ('PENDING', 'PAID', 'REFUNDED')),
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade,
  foreign key (sale_id, user_id, workspace_id)
    references public.business_sales(id, user_id, workspace_id) on delete cascade
);

create table if not exists public.business_sale_returns (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  workspace_id   uuid not null,
  sale_id        uuid not null,
  refund_amount  numeric(12,2) not null default 0 check (refund_amount >= 0),
  notes          text,
  created_at     timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, workspace_id),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade,
  foreign key (sale_id, user_id, workspace_id)
    references public.business_sales(id, user_id, workspace_id) on delete restrict
);

create table if not exists public.business_sale_return_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  workspace_id    uuid not null,
  return_id       uuid not null,
  sale_item_id    uuid not null,
  product_id      uuid not null,
  quantity        integer not null check (quantity > 0),
  restockable     boolean not null default true,
  created_at      timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade,
  foreign key (return_id, user_id, workspace_id)
    references public.business_sale_returns(id, user_id, workspace_id) on delete cascade,
  foreign key (sale_item_id, user_id, workspace_id)
    references public.business_sale_items(id, user_id, workspace_id) on delete restrict,
  foreign key (product_id, user_id, workspace_id)
    references public.business_products(id, user_id, workspace_id) on delete restrict
);

create table if not exists public.business_expenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workspace_id  uuid not null,
  description   text not null,
  category      text not null check (
    category in ('gasolina', 'embalagem', 'anuncios', 'entrega', 'manutencao', 'taxas', 'outras')
  ),
  amount        numeric(12,2) not null check (amount > 0),
  spent_at      date not null default current_date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade
);

create table if not exists public.business_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  actor_user_id  uuid not null references auth.users(id) on delete cascade,
  workspace_id   uuid not null,
  entity_type    text not null,
  entity_id      uuid not null,
  action         text not null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  foreign key (workspace_id, user_id)
    references public.business_workspaces(id, user_id) on delete cascade
);

do $$ begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists set_business_workspaces_updated_at on public.business_workspaces;
    create trigger set_business_workspaces_updated_at before update on public.business_workspaces
      for each row execute procedure public.set_updated_at();
    drop trigger if exists set_business_products_updated_at on public.business_products;
    create trigger set_business_products_updated_at before update on public.business_products
      for each row execute procedure public.set_updated_at();
    drop trigger if exists set_business_purchase_orders_updated_at on public.business_purchase_orders;
    create trigger set_business_purchase_orders_updated_at before update on public.business_purchase_orders
      for each row execute procedure public.set_updated_at();
    drop trigger if exists set_business_purchase_items_updated_at on public.business_purchase_items;
    create trigger set_business_purchase_items_updated_at before update on public.business_purchase_items
      for each row execute procedure public.set_updated_at();
    drop trigger if exists set_business_customers_updated_at on public.business_customers;
    create trigger set_business_customers_updated_at before update on public.business_customers
      for each row execute procedure public.set_updated_at();
    drop trigger if exists set_business_sales_updated_at on public.business_sales;
    create trigger set_business_sales_updated_at before update on public.business_sales
      for each row execute procedure public.set_updated_at();
    drop trigger if exists set_business_sale_items_updated_at on public.business_sale_items;
    create trigger set_business_sale_items_updated_at before update on public.business_sale_items
      for each row execute procedure public.set_updated_at();
    drop trigger if exists set_business_sale_item_allocations_updated_at on public.business_sale_item_allocations;
    create trigger set_business_sale_item_allocations_updated_at before update on public.business_sale_item_allocations
      for each row execute procedure public.set_updated_at();
    drop trigger if exists set_business_payments_updated_at on public.business_payments;
    create trigger set_business_payments_updated_at before update on public.business_payments
      for each row execute procedure public.set_updated_at();
    drop trigger if exists set_business_expenses_updated_at on public.business_expenses;
    create trigger set_business_expenses_updated_at before update on public.business_expenses
      for each row execute procedure public.set_updated_at();
  end if;
end $$;

alter table public.business_workspaces enable row level security;
alter table public.business_operation_idempotency enable row level security;
alter table public.business_products enable row level security;
alter table public.business_purchase_orders enable row level security;
alter table public.business_purchase_items enable row level security;
alter table public.business_inventory_lots enable row level security;
alter table public.business_customers enable row level security;
alter table public.business_sales enable row level security;
alter table public.business_sale_items enable row level security;
alter table public.business_sale_item_allocations enable row level security;
alter table public.business_inventory_movements enable row level security;
alter table public.business_payments enable row level security;
alter table public.business_sale_returns enable row level security;
alter table public.business_sale_return_items enable row level security;
alter table public.business_expenses enable row level security;
alter table public.business_audit_logs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_workspaces' and policyname = 'users can select own business_workspaces') then
    create policy "users can select own business_workspaces" on public.business_workspaces for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_workspaces' and policyname = 'users can insert own business_workspaces') then
    create policy "users can insert own business_workspaces" on public.business_workspaces for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_workspaces' and policyname = 'users can update own business_workspaces') then
    create policy "users can update own business_workspaces" on public.business_workspaces for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_products' and policyname = 'users can select own business_products') then
    create policy "users can select own business_products" on public.business_products for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_products' and policyname = 'users can insert own business_products') then
    create policy "users can insert own business_products" on public.business_products for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_products' and policyname = 'users can update own business_products') then
    create policy "users can update own business_products" on public.business_products for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_customers' and policyname = 'users can select own business_customers') then
    create policy "users can select own business_customers" on public.business_customers for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_customers' and policyname = 'users can insert own business_customers') then
    create policy "users can insert own business_customers" on public.business_customers for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_customers' and policyname = 'users can update own business_customers') then
    create policy "users can update own business_customers" on public.business_customers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_purchase_orders' and policyname = 'users can select own business_purchase_orders') then
    create policy "users can select own business_purchase_orders" on public.business_purchase_orders for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_purchase_items' and policyname = 'users can select own business_purchase_items') then
    create policy "users can select own business_purchase_items" on public.business_purchase_items for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_inventory_lots' and policyname = 'users can select own business_inventory_lots') then
    create policy "users can select own business_inventory_lots" on public.business_inventory_lots for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_sales' and policyname = 'users can select own business_sales') then
    create policy "users can select own business_sales" on public.business_sales for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_sale_items' and policyname = 'users can select own business_sale_items') then
    create policy "users can select own business_sale_items" on public.business_sale_items for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_sale_item_allocations' and policyname = 'users can select own business_sale_item_allocations') then
    create policy "users can select own business_sale_item_allocations" on public.business_sale_item_allocations for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_inventory_movements' and policyname = 'users can select own business_inventory_movements') then
    create policy "users can select own business_inventory_movements" on public.business_inventory_movements for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_payments' and policyname = 'users can select own business_payments') then
    create policy "users can select own business_payments" on public.business_payments for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_sale_returns' and policyname = 'users can select own business_sale_returns') then
    create policy "users can select own business_sale_returns" on public.business_sale_returns for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_sale_return_items' and policyname = 'users can select own business_sale_return_items') then
    create policy "users can select own business_sale_return_items" on public.business_sale_return_items for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_expenses' and policyname = 'users can select own business_expenses') then
    create policy "users can select own business_expenses" on public.business_expenses for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'business_audit_logs' and policyname = 'users can select own business_audit_logs') then
    create policy "users can select own business_audit_logs" on public.business_audit_logs for select using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_business_workspaces_user on public.business_workspaces(user_id);
create index if not exists idx_business_products_workspace on public.business_products(user_id, workspace_id, active);
create index if not exists idx_business_purchase_orders_workspace_status on public.business_purchase_orders(user_id, workspace_id, status, purchase_date desc);
create index if not exists idx_business_purchase_items_purchase on public.business_purchase_items(purchase_order_id);
create index if not exists idx_business_inventory_lots_product on public.business_inventory_lots(user_id, workspace_id, product_id, received_at);
create index if not exists idx_business_sales_workspace_status on public.business_sales(user_id, workspace_id, order_status, sale_date desc);
create index if not exists idx_business_sale_items_sale on public.business_sale_items(sale_id);
create index if not exists idx_business_allocations_lot_status on public.business_sale_item_allocations(inventory_lot_id, status);
create index if not exists idx_business_movements_product_created on public.business_inventory_movements(user_id, workspace_id, product_id, created_at desc);
create index if not exists idx_business_payments_sale on public.business_payments(sale_id);
create index if not exists idx_business_returns_sale on public.business_sale_returns(sale_id);
create index if not exists idx_business_return_items_return on public.business_sale_return_items(return_id);
create index if not exists idx_business_expenses_workspace_spent on public.business_expenses(user_id, workspace_id, spent_at desc);
create index if not exists idx_business_audit_entity on public.business_audit_logs(user_id, workspace_id, entity_type, entity_id, created_at desc);

create or replace view public.business_inventory_summary
with (security_invoker = true)
as
select
  product.id as product_id,
  product.user_id,
  product.workspace_id,
  product.name,
  product.sku,
  product.default_sale_price,
  product.minimum_stock,
  coalesce(stock.on_hand, 0)::integer as on_hand,
  coalesce(stock.reserved, 0)::integer as reserved,
  greatest(coalesce(stock.on_hand, 0) - coalesce(stock.reserved, 0), 0)::integer as available,
  coalesce(in_transit.quantity, 0)::integer as in_transit,
  coalesce(stock.inventory_value, 0)::numeric(12,2) as inventory_value,
  case
    when coalesce(stock.on_hand, 0) > 0 then round(stock.inventory_value / stock.on_hand, 2)
    else 0
  end::numeric(12,2) as average_unit_cost,
  case
    when product.default_sale_price is not null and coalesce(stock.on_hand, 0) > 0 then
      round((product.default_sale_price * coalesce(stock.on_hand, 0)) - stock.inventory_value, 2)
    else 0
  end::numeric(12,2) as estimated_profit
from public.business_products product
left join (
  select
    user_id,
    workspace_id,
    product_id,
    sum(remaining_quantity) as on_hand,
    sum(reserved_quantity) as reserved,
    sum(remaining_quantity * unit_cost) as inventory_value
  from public.business_inventory_lots
  group by user_id, workspace_id, product_id
) stock on stock.product_id = product.id
  and stock.user_id = product.user_id
  and stock.workspace_id = product.workspace_id
left join (
  select
    item.user_id,
    item.workspace_id,
    item.product_id,
    sum(item.quantity_ordered - item.quantity_received) as quantity
  from public.business_purchase_items item
  join public.business_purchase_orders po
    on po.id = item.purchase_order_id
    and po.user_id = item.user_id
    and po.workspace_id = item.workspace_id
  where po.status in ('PURCHASED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')
  group by item.user_id, item.workspace_id, item.product_id
) in_transit on in_transit.product_id = product.id
  and in_transit.user_id = product.user_id
  and in_transit.workspace_id = product.workspace_id;

grant select on public.business_inventory_summary to authenticated;

create or replace function public.business_assert_workspace(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.business_workspaces
    where id = p_workspace_id and user_id = p_user_id
  ) then
    raise exception 'Workspace nao encontrado';
  end if;
end;
$$;

create or replace function public.business_claim_idempotency(
  p_user_id uuid,
  p_workspace_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  existing_row public.business_operation_idempotency%rowtype;
begin
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'Chave de idempotencia obrigatoria';
  end if;

  insert into public.business_operation_idempotency (
    user_id,
    workspace_id,
    operation,
    idempotency_key,
    request_hash
  )
  values (p_user_id, p_workspace_id, p_operation, p_idempotency_key, p_request_hash)
  on conflict (user_id, workspace_id, operation, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    return null;
  end if;

  select *
    into existing_row
  from public.business_operation_idempotency
  where user_id = p_user_id
    and workspace_id = p_workspace_id
    and operation = p_operation
    and idempotency_key = p_idempotency_key
  for update;

  if existing_row.request_hash <> p_request_hash then
    raise exception 'Chave de idempotencia reutilizada com payload diferente';
  end if;

  if existing_row.status = 'COMPLETED' and existing_row.response is not null then
    return existing_row.response;
  end if;

  raise exception 'Operacao idempotente em processamento';
end;
$$;

create or replace function public.business_complete_idempotency(
  p_user_id uuid,
  p_workspace_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_response jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.business_operation_idempotency
  set status = 'COMPLETED',
      response = p_response,
      completed_at = now()
  where user_id = p_user_id
    and workspace_id = p_workspace_id
    and operation = p_operation
    and idempotency_key = p_idempotency_key;
end;
$$;

create or replace function public.business_log_audit(
  p_user_id uuid,
  p_actor_user_id uuid,
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_audit_logs (
    user_id,
    actor_user_id,
    workspace_id,
    entity_type,
    entity_id,
    action,
    metadata
  )
  values (
    p_user_id,
    p_actor_user_id,
    p_workspace_id,
    p_entity_type,
    p_entity_id,
    p_action,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

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
  sale_total numeric(12,2);
  paid_total numeric(12,2);
  refunded_total numeric(12,2);
  net_paid numeric(12,2);
  next_status text;
begin
  select coalesce(sum(final_amount), 0)
    into sale_total
  from public.business_sale_items
  where sale_id = p_sale_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  select
    coalesce(sum(amount) filter (where status = 'PAID'), 0),
    coalesce(sum(amount) filter (where status = 'REFUNDED'), 0)
    into paid_total, refunded_total
  from public.business_payments
  where sale_id = p_sale_id
    and user_id = p_user_id
    and workspace_id = p_workspace_id;

  net_paid := paid_total - refunded_total;

  next_status := case
    when refunded_total > 0 and net_paid <= 0 then 'REFUNDED'
    when net_paid <= 0 then 'PENDING'
    when net_paid < sale_total then 'PARTIALLY_PAID'
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

create or replace function public.create_business_purchase(
  p_workspace_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_purchase_cost numeric,
  p_idempotency_key text,
  p_shipping_cost numeric default 0,
  p_additional_costs numeric default 0,
  p_purchase_date date default current_date,
  p_expected_arrival_date date default null,
  p_origin text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  product_subtotal numeric(12,2);
  total_cost numeric(12,2);
  real_unit_cost numeric(12,2);
  purchase_id uuid;
  purchase_item_id uuid;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  request_hash := md5(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'product_id', p_product_id,
    'quantity', p_quantity,
    'unit_purchase_cost', p_unit_purchase_cost,
    'shipping_cost', p_shipping_cost,
    'additional_costs', p_additional_costs,
    'purchase_date', p_purchase_date,
    'expected_arrival_date', p_expected_arrival_date,
    'origin', p_origin,
    'notes', p_notes
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_purchase',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  if not exists (
    select 1 from public.business_products
    where id = p_product_id
      and user_id = current_user_id
      and workspace_id = p_workspace_id
      and active = true
  ) then
    raise exception 'Produto nao encontrado';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade deve ser positiva';
  end if;
  if p_unit_purchase_cost is null or p_unit_purchase_cost < 0 or p_shipping_cost < 0 or p_additional_costs < 0 then
    raise exception 'Valores de compra nao podem ser negativos';
  end if;

  product_subtotal := round(p_quantity * p_unit_purchase_cost, 2);
  total_cost := round(product_subtotal + coalesce(p_shipping_cost, 0) + coalesce(p_additional_costs, 0), 2);
  real_unit_cost := round(total_cost / p_quantity, 2);

  insert into public.business_purchase_orders (
    user_id,
    workspace_id,
    purchase_date,
    expected_arrival_date,
    origin,
    product_subtotal,
    shipping_cost,
    additional_costs,
    total_cost,
    status,
    notes
  )
  values (
    current_user_id,
    p_workspace_id,
    coalesce(p_purchase_date, current_date),
    p_expected_arrival_date,
    nullif(trim(p_origin), ''),
    product_subtotal,
    round(coalesce(p_shipping_cost, 0), 2),
    round(coalesce(p_additional_costs, 0), 2),
    total_cost,
    'PURCHASED',
    nullif(trim(p_notes), '')
  )
  returning id into purchase_id;

  insert into public.business_purchase_items (
    user_id,
    workspace_id,
    purchase_order_id,
    product_id,
    quantity_ordered,
    unit_purchase_cost,
    allocated_extra_cost,
    real_unit_cost
  )
  values (
    current_user_id,
    p_workspace_id,
    purchase_id,
    p_product_id,
    p_quantity,
    round(p_unit_purchase_cost, 2),
    round(coalesce(p_shipping_cost, 0) + coalesce(p_additional_costs, 0), 2),
    real_unit_cost
  )
  returning id into purchase_item_id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    p_workspace_id,
    'purchase_order',
    purchase_id,
    'purchase_created',
    jsonb_build_object('quantity', p_quantity, 'total_cost', total_cost)
  );

  response := jsonb_build_object(
    'purchase_order_id', purchase_id,
    'purchase_item_id', purchase_item_id,
    'status', 'PURCHASED',
    'total_cost', total_cost,
    'real_unit_cost', real_unit_cost
  );

  perform public.business_complete_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_purchase',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

create or replace function public.update_business_purchase(
  p_purchase_order_id uuid,
  p_idempotency_key text,
  p_quantity integer default null,
  p_unit_purchase_cost numeric default null,
  p_shipping_cost numeric default null,
  p_additional_costs numeric default null,
  p_purchase_date date default null,
  p_expected_arrival_date date default null,
  p_origin text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  purchase_row public.business_purchase_orders%rowtype;
  item_row public.business_purchase_items%rowtype;
  next_quantity integer;
  next_unit_cost numeric(12,2);
  next_shipping numeric(12,2);
  next_additional numeric(12,2);
  next_product_subtotal numeric(12,2);
  next_total_cost numeric(12,2);
  next_real_unit_cost numeric(12,2);
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into purchase_row
  from public.business_purchase_orders
  where id = p_purchase_order_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Compra nao encontrada';
  end if;

  request_hash := md5(jsonb_build_object(
    'purchase_order_id', p_purchase_order_id,
    'quantity', p_quantity,
    'unit_purchase_cost', p_unit_purchase_cost,
    'shipping_cost', p_shipping_cost,
    'additional_costs', p_additional_costs,
    'purchase_date', p_purchase_date,
    'expected_arrival_date', p_expected_arrival_date,
    'origin', p_origin,
    'notes', p_notes
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'update_business_purchase',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  select *
    into item_row
  from public.business_purchase_items
  where purchase_order_id = purchase_row.id
    and user_id = current_user_id
    and workspace_id = purchase_row.workspace_id
  order by created_at, id
  limit 1
  for update;

  if not found then
    raise exception 'Compra sem item';
  end if;

  next_quantity := coalesce(p_quantity, item_row.quantity_ordered);
  next_unit_cost := round(coalesce(p_unit_purchase_cost, item_row.unit_purchase_cost), 2);
  next_shipping := round(coalesce(p_shipping_cost, purchase_row.shipping_cost), 2);
  next_additional := round(coalesce(p_additional_costs, purchase_row.additional_costs), 2);

  if next_quantity <= 0 or next_unit_cost < 0 or next_shipping < 0 or next_additional < 0 then
    raise exception 'Valores de compra invalidos';
  end if;

  if purchase_row.status = 'RECEIVED' and (
    p_quantity is not null or p_unit_purchase_cost is not null or p_shipping_cost is not null or
    p_additional_costs is not null or p_purchase_date is not null
  ) then
    raise exception 'Compra recebida nao permite alterar dados financeiros ou quantidade';
  end if;

  if purchase_row.status = 'PARTIALLY_RECEIVED' then
    if next_quantity < item_row.quantity_received then
      raise exception 'Quantidade nao pode ficar menor que a ja recebida';
    end if;
    if p_unit_purchase_cost is not null or p_shipping_cost is not null or p_additional_costs is not null then
      raise exception 'Compra parcialmente recebida nao permite alterar custos historicos';
    end if;
  end if;

  if purchase_row.status = 'CANCELLED' then
    raise exception 'Compra cancelada nao pode ser editada';
  end if;

  next_product_subtotal := round(next_quantity * next_unit_cost, 2);
  next_total_cost := round(next_product_subtotal + next_shipping + next_additional, 2);
  next_real_unit_cost := round(next_total_cost / next_quantity, 2);

  update public.business_purchase_orders
  set purchase_date = coalesce(p_purchase_date, purchase_date),
      expected_arrival_date = coalesce(p_expected_arrival_date, expected_arrival_date),
      origin = coalesce(nullif(trim(p_origin), ''), origin),
      product_subtotal = case when status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_product_subtotal else product_subtotal end,
      shipping_cost = case when status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_shipping else shipping_cost end,
      additional_costs = case when status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_additional else additional_costs end,
      total_cost = case when status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_total_cost else total_cost end,
      notes = coalesce(nullif(trim(p_notes), ''), notes)
  where id = purchase_row.id;

  update public.business_purchase_items
  set quantity_ordered = next_quantity,
      unit_purchase_cost = case when purchase_row.status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_unit_cost else unit_purchase_cost end,
      allocated_extra_cost = case when purchase_row.status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_shipping + next_additional else allocated_extra_cost end,
      real_unit_cost = case when purchase_row.status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_real_unit_cost else real_unit_cost end
  where id = item_row.id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    purchase_row.workspace_id,
    'purchase_order',
    purchase_row.id,
    'purchase_updated',
    jsonb_build_object('status', purchase_row.status, 'quantity', next_quantity)
  );

  response := jsonb_build_object(
    'purchase_order_id', purchase_row.id,
    'status', purchase_row.status,
    'quantity_ordered', next_quantity,
    'total_cost', case when purchase_row.status in ('DRAFT', 'PURCHASED', 'IN_TRANSIT') then next_total_cost else purchase_row.total_cost end
  );

  perform public.business_complete_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'update_business_purchase',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

create or replace function public.receive_business_purchase(
  p_purchase_order_id uuid,
  p_idempotency_key text,
  p_quantity integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  purchase_row public.business_purchase_orders%rowtype;
  item_row public.business_purchase_items%rowtype;
  requested_quantity integer;
  remaining_to_receive integer;
  quantity_for_item integer;
  total_pending integer;
  still_pending integer;
  received_count integer := 0;
  request_hash text;
  existing_response jsonb;
  response jsonb;
  lot_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into purchase_row
  from public.business_purchase_orders
  where id = p_purchase_order_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Compra nao encontrada';
  end if;

  request_hash := md5(jsonb_build_object(
    'purchase_order_id', p_purchase_order_id,
    'quantity', p_quantity
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'receive_business_purchase',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  if purchase_row.status not in ('PURCHASED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED') then
    raise exception 'Compra nao pode ser recebida no status atual';
  end if;

  select coalesce(sum(quantity_ordered - quantity_received), 0)
    into total_pending
  from public.business_purchase_items
  where purchase_order_id = p_purchase_order_id
    and user_id = current_user_id
    and workspace_id = purchase_row.workspace_id;

  if total_pending <= 0 then
    raise exception 'Compra sem itens pendentes para receber';
  end if;

  requested_quantity := coalesce(p_quantity, total_pending);
  if requested_quantity <= 0 then
    raise exception 'Quantidade recebida deve ser positiva';
  end if;
  if requested_quantity > total_pending then
    raise exception 'Recebimento maior que a quantidade pendente';
  end if;

  remaining_to_receive := requested_quantity;

  for item_row in
    select *
    from public.business_purchase_items
    where purchase_order_id = p_purchase_order_id
      and user_id = current_user_id
      and workspace_id = purchase_row.workspace_id
      and quantity_received < quantity_ordered
    order by created_at, id
    for update
  loop
    exit when remaining_to_receive <= 0;
    quantity_for_item := least(remaining_to_receive, item_row.quantity_ordered - item_row.quantity_received);

    update public.business_purchase_items
    set quantity_received = quantity_received + quantity_for_item
    where id = item_row.id;

    insert into public.business_inventory_lots (
      user_id,
      workspace_id,
      product_id,
      purchase_item_id,
      received_quantity,
      remaining_quantity,
      unit_cost
    )
    values (
      current_user_id,
      purchase_row.workspace_id,
      item_row.product_id,
      item_row.id,
      quantity_for_item,
      quantity_for_item,
      item_row.real_unit_cost
    )
    returning id into lot_id;

    insert into public.business_inventory_movements (
      user_id,
      workspace_id,
      product_id,
      inventory_lot_id,
      movement_type,
      quantity_delta,
      unit_cost,
      total_cost,
      reference_type,
      reference_id
    )
    values (
      current_user_id,
      purchase_row.workspace_id,
      item_row.product_id,
      lot_id,
      'PURCHASE_RECEIPT',
      quantity_for_item,
      item_row.real_unit_cost,
      round(quantity_for_item * item_row.real_unit_cost, 2),
      'purchase_order',
      purchase_row.id
    );

    received_count := received_count + quantity_for_item;
    remaining_to_receive := remaining_to_receive - quantity_for_item;
  end loop;

  select coalesce(sum(quantity_ordered - quantity_received), 0)
    into still_pending
  from public.business_purchase_items
  where purchase_order_id = p_purchase_order_id
    and user_id = current_user_id
    and workspace_id = purchase_row.workspace_id;

  update public.business_purchase_orders
  set status = case when still_pending = 0 then 'RECEIVED' else 'PARTIALLY_RECEIVED' end
  where id = purchase_row.id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    purchase_row.workspace_id,
    'purchase_order',
    purchase_row.id,
    'purchase_received',
    jsonb_build_object('received_quantity', received_count, 'remaining_quantity', still_pending)
  );

  response := jsonb_build_object(
    'purchase_order_id', purchase_row.id,
    'received_quantity', received_count,
    'remaining_quantity', still_pending,
    'status', case when still_pending = 0 then 'RECEIVED' else 'PARTIALLY_RECEIVED' end
  );

  perform public.business_complete_idempotency(
    current_user_id,
    purchase_row.workspace_id,
    'receive_business_purchase',
    p_idempotency_key,
    response
  );

  return response;
end;
$$;

create or replace function public.reserve_business_sale(
  p_sale_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_row public.business_sales%rowtype;
  item_row public.business_sale_items%rowtype;
  lot_row public.business_inventory_lots%rowtype;
  needed_quantity integer;
  alloc_quantity integer;
  allocated_quantity integer := 0;
  item_cogs numeric(12,2);
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into sale_row
  from public.business_sales
  where id = p_sale_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada';
  end if;

  request_hash := md5(jsonb_build_object('sale_id', p_sale_id)::text);
  existing_response := public.business_claim_idempotency(
    current_user_id,
    sale_row.workspace_id,
    'reserve_business_sale',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  if sale_row.order_status <> 'DRAFT' then
    raise exception 'Venda nao pode ser reservada no status atual';
  end if;

  for item_row in
    select *
    from public.business_sale_items
    where sale_id = p_sale_id
      and user_id = current_user_id
      and workspace_id = sale_row.workspace_id
    order by created_at, id
    for update
  loop
    needed_quantity := item_row.quantity;
    item_cogs := 0;

    for lot_row in
      select *
      from public.business_inventory_lots
      where user_id = current_user_id
        and workspace_id = sale_row.workspace_id
        and product_id = item_row.product_id
        and remaining_quantity - reserved_quantity > 0
      order by received_at, id
      for update
    loop
      exit when needed_quantity <= 0;
      alloc_quantity := least(needed_quantity, lot_row.remaining_quantity - lot_row.reserved_quantity);

      update public.business_inventory_lots
      set reserved_quantity = reserved_quantity + alloc_quantity
      where id = lot_row.id;

      insert into public.business_sale_item_allocations (
        user_id,
        workspace_id,
        sale_item_id,
        inventory_lot_id,
        quantity,
        unit_cost
      )
      values (
        current_user_id,
        sale_row.workspace_id,
        item_row.id,
        lot_row.id,
        alloc_quantity,
        lot_row.unit_cost
      );

      needed_quantity := needed_quantity - alloc_quantity;
      allocated_quantity := allocated_quantity + alloc_quantity;
      item_cogs := item_cogs + round(alloc_quantity * lot_row.unit_cost, 2);
    end loop;

    if needed_quantity > 0 then
      raise exception 'Estoque insuficiente para reservar a venda';
    end if;

    update public.business_sale_items
    set cogs_amount = item_cogs,
        gross_profit = round(final_amount - item_cogs, 2),
        net_profit = round(final_amount - item_cogs - platform_fee - shipping_cost - additional_costs, 2),
        margin_pct = case
          when final_amount > 0 then round(((final_amount - item_cogs - platform_fee - shipping_cost - additional_costs) / final_amount) * 100, 4)
          else null
        end
    where id = item_row.id;
  end loop;

  update public.business_sales
  set order_status = 'RESERVED'
  where id = sale_row.id;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    sale_row.workspace_id,
    'sale',
    sale_row.id,
    'sale_reserved',
    jsonb_build_object('allocated_quantity', allocated_quantity)
  );

  response := jsonb_build_object(
    'sale_id', sale_row.id,
    'allocated_quantity', allocated_quantity,
    'status', 'RESERVED'
  );

  perform public.business_complete_idempotency(current_user_id, sale_row.workspace_id, 'reserve_business_sale', p_idempotency_key, response);
  return response;
end;
$$;

create or replace function public.create_business_sale(
  p_workspace_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_customer_id uuid default null,
  p_sale_date timestamptz default now(),
  p_notes text default null,
  p_reserve boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_id uuid;
  item_payload jsonb;
  item_product_id uuid;
  quantity integer;
  unit_sale_price numeric(12,2);
  discount_amount numeric(12,2);
  platform_fee numeric(12,2);
  shipping_cost numeric(12,2);
  additional_costs numeric(12,2);
  gross_amount numeric(12,2);
  final_amount numeric(12,2);
  available_quantity integer;
  request_hash text;
  existing_response jsonb;
  reserve_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  request_hash := md5(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'items', p_items,
    'customer_id', p_customer_id,
    'sale_date', p_sale_date,
    'notes', p_notes,
    'reserve', p_reserve
  )::text);

  existing_response := public.business_claim_idempotency(
    current_user_id,
    p_workspace_id,
    'create_business_sale',
    p_idempotency_key,
    request_hash
  );
  if existing_response is not null then
    return existing_response;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Venda precisa receber uma lista de itens';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Venda precisa ter ao menos um item';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.business_customers
    where id = p_customer_id
      and user_id = current_user_id
      and workspace_id = p_workspace_id
  ) then
    raise exception 'Cliente nao encontrado';
  end if;

  insert into public.business_sales (
    user_id,
    workspace_id,
    customer_id,
    order_status,
    payment_status,
    sale_date,
    notes
  )
  values (
    current_user_id,
    p_workspace_id,
    p_customer_id,
    'DRAFT',
    'PENDING',
    coalesce(p_sale_date, now()),
    nullif(trim(p_notes), '')
  )
  returning id into sale_id;

  for item_payload in select * from jsonb_array_elements(p_items)
  loop
    item_product_id := (item_payload->>'product_id')::uuid;
    quantity := (item_payload->>'quantity')::integer;
    unit_sale_price := round((item_payload->>'unit_sale_price')::numeric, 2);
    discount_amount := round(coalesce((item_payload->>'discount_amount')::numeric, 0), 2);
    platform_fee := round(coalesce((item_payload->>'platform_fee')::numeric, 0), 2);
    shipping_cost := round(coalesce((item_payload->>'shipping_cost')::numeric, 0), 2);
    additional_costs := round(coalesce((item_payload->>'additional_costs')::numeric, 0), 2);

    if not exists (
      select 1 from public.business_products
      where id = item_product_id
        and user_id = current_user_id
        and workspace_id = p_workspace_id
        and active = true
    ) then
      raise exception 'Produto da venda nao encontrado';
    end if;

    if quantity <= 0 or unit_sale_price < 0 or discount_amount < 0 or platform_fee < 0 or shipping_cost < 0 or additional_costs < 0 then
      raise exception 'Item de venda invalido';
    end if;

    gross_amount := round(quantity * unit_sale_price, 2);
    if discount_amount > gross_amount then
      raise exception 'Desconto maior que o valor bruto';
    end if;
    final_amount := round(gross_amount - discount_amount, 2);

    select coalesce(sum(remaining_quantity - reserved_quantity), 0)
      into available_quantity
    from public.business_inventory_lots
    where user_id = current_user_id
      and workspace_id = p_workspace_id
      and product_id = item_product_id;

    if available_quantity < quantity then
      raise exception 'Estoque insuficiente para criar a venda';
    end if;

    insert into public.business_sale_items (
      user_id,
      workspace_id,
      sale_id,
      product_id,
      quantity,
      unit_sale_price,
      gross_amount,
      discount_amount,
      final_amount,
      platform_fee,
      shipping_cost,
      additional_costs,
      gross_profit,
      net_profit,
      margin_pct
    )
    values (
      current_user_id,
      p_workspace_id,
      sale_id,
      item_product_id,
      quantity,
      unit_sale_price,
      gross_amount,
      discount_amount,
      final_amount,
      platform_fee,
      shipping_cost,
      additional_costs,
      final_amount,
      round(final_amount - platform_fee - shipping_cost - additional_costs, 2),
      case when final_amount > 0 then round(((final_amount - platform_fee - shipping_cost - additional_costs) / final_amount) * 100, 4) else null end
    );
  end loop;

  perform public.business_log_audit(
    current_user_id,
    current_user_id,
    p_workspace_id,
    'sale',
    sale_id,
    'sale_created',
    jsonb_build_object('items_count', jsonb_array_length(p_items), 'reserve', p_reserve)
  );

  if coalesce(p_reserve, true) then
    reserve_response := public.reserve_business_sale(sale_id, p_idempotency_key || ':reserve');
  end if;

  response := jsonb_build_object(
    'sale_id', sale_id,
    'status', case when coalesce(p_reserve, true) then 'RESERVED' else 'DRAFT' end,
    'reserve', reserve_response
  );

  perform public.business_complete_idempotency(current_user_id, p_workspace_id, 'create_business_sale', p_idempotency_key, response);
  return response;
end;
$$;

create or replace function public.deliver_business_sale(
  p_sale_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_row public.business_sales%rowtype;
  allocation_row record;
  delivered_quantity integer := 0;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into sale_row
  from public.business_sales
  where id = p_sale_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada';
  end if;

  request_hash := md5(jsonb_build_object('sale_id', p_sale_id)::text);
  existing_response := public.business_claim_idempotency(current_user_id, sale_row.workspace_id, 'deliver_business_sale', p_idempotency_key, request_hash);
  if existing_response is not null then
    return existing_response;
  end if;

  if sale_row.order_status not in ('RESERVED', 'SEPARATED', 'SHIPPED') then
    raise exception 'Venda precisa estar reservada, separada ou enviada para entrega';
  end if;

  for allocation_row in
    select
      allocation.id,
      allocation.quantity,
      allocation.unit_cost,
      lot.id as lot_id,
      lot.product_id,
      lot.remaining_quantity,
      lot.reserved_quantity
    from public.business_sale_item_allocations allocation
    join public.business_inventory_lots lot
      on lot.id = allocation.inventory_lot_id
      and lot.user_id = allocation.user_id
      and lot.workspace_id = allocation.workspace_id
    join public.business_sale_items item
      on item.id = allocation.sale_item_id
      and item.user_id = allocation.user_id
      and item.workspace_id = allocation.workspace_id
    where item.sale_id = p_sale_id
      and allocation.user_id = current_user_id
      and allocation.workspace_id = sale_row.workspace_id
      and allocation.status = 'RESERVED'
    order by allocation.created_at, allocation.id
    for update of allocation, lot
  loop
    if allocation_row.remaining_quantity < allocation_row.quantity or allocation_row.reserved_quantity < allocation_row.quantity then
      raise exception 'Lote reservado nao possui saldo suficiente';
    end if;

    update public.business_inventory_lots
    set remaining_quantity = remaining_quantity - allocation_row.quantity,
        reserved_quantity = reserved_quantity - allocation_row.quantity
    where id = allocation_row.lot_id;

    update public.business_sale_item_allocations
    set status = 'CONSUMED'
    where id = allocation_row.id;

    insert into public.business_inventory_movements (
      user_id,
      workspace_id,
      product_id,
      inventory_lot_id,
      movement_type,
      quantity_delta,
      unit_cost,
      total_cost,
      reference_type,
      reference_id
    )
    values (
      current_user_id,
      sale_row.workspace_id,
      allocation_row.product_id,
      allocation_row.lot_id,
      'SALE_OUT',
      -allocation_row.quantity,
      allocation_row.unit_cost,
      round(allocation_row.quantity * allocation_row.unit_cost, 2),
      'sale',
      sale_row.id
    );

    delivered_quantity := delivered_quantity + allocation_row.quantity;
  end loop;

  if delivered_quantity = 0 then
    raise exception 'Venda sem reservas pendentes para entregar';
  end if;

  update public.business_sales
  set order_status = 'DELIVERED',
      delivered_at = now()
  where id = sale_row.id;

  perform public.business_log_audit(current_user_id, current_user_id, sale_row.workspace_id, 'sale', sale_row.id, 'sale_delivered', jsonb_build_object('delivered_quantity', delivered_quantity));

  response := jsonb_build_object('sale_id', sale_row.id, 'delivered_quantity', delivered_quantity, 'status', 'DELIVERED');
  perform public.business_complete_idempotency(current_user_id, sale_row.workspace_id, 'deliver_business_sale', p_idempotency_key, response);
  return response;
end;
$$;

create or replace function public.cancel_business_sale(
  p_sale_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_row public.business_sales%rowtype;
  allocation_row record;
  released_quantity integer := 0;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into sale_row
  from public.business_sales
  where id = p_sale_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada';
  end if;

  request_hash := md5(jsonb_build_object('sale_id', p_sale_id)::text);
  existing_response := public.business_claim_idempotency(current_user_id, sale_row.workspace_id, 'cancel_business_sale', p_idempotency_key, request_hash);
  if existing_response is not null then
    return existing_response;
  end if;

  if sale_row.order_status in ('DELIVERED', 'RETURNED') then
    raise exception 'Venda entregue nao pode ser cancelada; use devolucao';
  end if;

  for allocation_row in
    select
      allocation.id,
      allocation.quantity,
      lot.id as lot_id,
      lot.reserved_quantity
    from public.business_sale_item_allocations allocation
    join public.business_inventory_lots lot
      on lot.id = allocation.inventory_lot_id
      and lot.user_id = allocation.user_id
      and lot.workspace_id = allocation.workspace_id
    join public.business_sale_items item
      on item.id = allocation.sale_item_id
      and item.user_id = allocation.user_id
      and item.workspace_id = allocation.workspace_id
    where item.sale_id = p_sale_id
      and allocation.user_id = current_user_id
      and allocation.workspace_id = sale_row.workspace_id
      and allocation.status = 'RESERVED'
    order by allocation.created_at, allocation.id
    for update of allocation, lot
  loop
    if allocation_row.reserved_quantity < allocation_row.quantity then
      raise exception 'Reserva inconsistente para cancelamento';
    end if;

    update public.business_inventory_lots
    set reserved_quantity = reserved_quantity - allocation_row.quantity
    where id = allocation_row.lot_id;

    update public.business_sale_item_allocations
    set status = 'RELEASED'
    where id = allocation_row.id;

    released_quantity := released_quantity + allocation_row.quantity;
  end loop;

  update public.business_sales
  set order_status = 'CANCELLED'
  where id = sale_row.id;

  perform public.business_log_audit(current_user_id, current_user_id, sale_row.workspace_id, 'sale', sale_row.id, 'sale_cancelled', jsonb_build_object('released_quantity', released_quantity));

  response := jsonb_build_object('sale_id', sale_row.id, 'released_quantity', released_quantity, 'status', 'CANCELLED');
  perform public.business_complete_idempotency(current_user_id, sale_row.workspace_id, 'cancel_business_sale', p_idempotency_key, response);
  return response;
end;
$$;

create or replace function public.record_business_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_payment_method text default null,
  p_status text default 'PAID',
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_row public.business_sales%rowtype;
  sale_total numeric(12,2);
  paid_total numeric(12,2);
  refunded_total numeric(12,2);
  next_status text;
  payment_id uuid;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into sale_row
  from public.business_sales
  where id = p_sale_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada';
  end if;

  request_hash := md5(jsonb_build_object(
    'sale_id', p_sale_id,
    'amount', p_amount,
    'payment_method', p_payment_method,
    'status', p_status,
    'paid_at', p_paid_at,
    'notes', p_notes
  )::text);
  existing_response := public.business_claim_idempotency(current_user_id, sale_row.workspace_id, 'record_business_payment', p_idempotency_key, request_hash);
  if existing_response is not null then
    return existing_response;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor do pagamento deve ser positivo';
  end if;
  if p_status is null or p_status not in ('PAID', 'REFUNDED') then
    raise exception 'Status de pagamento invalido';
  end if;

  select coalesce(sum(final_amount), 0)
    into sale_total
  from public.business_sale_items
  where sale_id = p_sale_id
    and user_id = current_user_id
    and workspace_id = sale_row.workspace_id;

  select
    coalesce(sum(amount) filter (where status = 'PAID'), 0),
    coalesce(sum(amount) filter (where status = 'REFUNDED'), 0)
    into paid_total, refunded_total
  from public.business_payments
  where sale_id = p_sale_id
    and user_id = current_user_id
    and workspace_id = sale_row.workspace_id;

  if p_status = 'PAID' and paid_total - refunded_total + round(p_amount, 2) > sale_total then
    raise exception 'Pagamento acumulado maior que o valor devido';
  end if;
  if p_status = 'REFUNDED' and round(p_amount, 2) > paid_total - refunded_total then
    raise exception 'Reembolso maior que o valor pago disponivel';
  end if;

  insert into public.business_payments (
    user_id,
    workspace_id,
    sale_id,
    amount,
    payment_method,
    status,
    paid_at,
    notes
  )
  values (
    current_user_id,
    sale_row.workspace_id,
    sale_row.id,
    round(p_amount, 2),
    nullif(trim(p_payment_method), ''),
    p_status,
    coalesce(p_paid_at, now()),
    nullif(trim(p_notes), '')
  )
  returning id into payment_id;

  next_status := public.business_refresh_sale_payment_status(sale_row.id, current_user_id, sale_row.workspace_id);

  perform public.business_log_audit(current_user_id, current_user_id, sale_row.workspace_id, 'sale', sale_row.id, 'payment_recorded', jsonb_build_object('payment_id', payment_id, 'amount', round(p_amount, 2), 'payment_status', next_status));

  response := jsonb_build_object('payment_id', payment_id, 'sale_id', sale_row.id, 'payment_status', next_status);
  perform public.business_complete_idempotency(current_user_id, sale_row.workspace_id, 'record_business_payment', p_idempotency_key, response);
  return response;
end;
$$;

create or replace function public.return_business_sale(
  p_sale_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_refund_amount numeric default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  sale_row public.business_sales%rowtype;
  return_id uuid;
  item_payload jsonb;
  sale_item_row public.business_sale_items%rowtype;
  allocation_row record;
  requested_quantity integer;
  remaining_quantity integer;
  alloc_return_quantity integer;
  restockable boolean;
  already_returned integer;
  total_returned integer := 0;
  total_sale_quantity integer;
  total_returned_all_time integer;
  next_payment_status text;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into sale_row
  from public.business_sales
  where id = p_sale_id and user_id = current_user_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada';
  end if;

  request_hash := md5(jsonb_build_object(
    'sale_id', p_sale_id,
    'items', p_items,
    'refund_amount', p_refund_amount,
    'notes', p_notes
  )::text);
  existing_response := public.business_claim_idempotency(current_user_id, sale_row.workspace_id, 'return_business_sale', p_idempotency_key, request_hash);
  if existing_response is not null then
    return existing_response;
  end if;

  if sale_row.order_status not in ('DELIVERED', 'RETURNED') then
    raise exception 'Somente venda entregue pode receber devolucao';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Devolucao precisa receber uma lista de itens';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Devolucao precisa ter ao menos um item';
  end if;
  if p_refund_amount < 0 then
    raise exception 'Valor devolvido nao pode ser negativo';
  end if;

  insert into public.business_sale_returns (user_id, workspace_id, sale_id, refund_amount, notes)
  values (current_user_id, sale_row.workspace_id, sale_row.id, round(coalesce(p_refund_amount, 0), 2), nullif(trim(p_notes), ''))
  returning id into return_id;

  for item_payload in select * from jsonb_array_elements(p_items)
  loop
    select *
      into sale_item_row
    from public.business_sale_items
    where id = (item_payload->>'sale_item_id')::uuid
      and sale_id = sale_row.id
      and user_id = current_user_id
      and workspace_id = sale_row.workspace_id
    for update;

    if not found then
      raise exception 'Item de venda nao encontrado para devolucao';
    end if;

    requested_quantity := (item_payload->>'quantity')::integer;
    restockable := coalesce((item_payload->>'restockable')::boolean, true);
    if requested_quantity <= 0 then
      raise exception 'Quantidade devolvida deve ser positiva';
    end if;

    select coalesce(sum(quantity), 0)
      into already_returned
    from public.business_sale_return_items
    where sale_item_id = sale_item_row.id
      and user_id = current_user_id
      and workspace_id = sale_row.workspace_id;

    if requested_quantity > sale_item_row.quantity - already_returned then
      raise exception 'Devolucao maior que a quantidade entregue disponivel';
    end if;

    insert into public.business_sale_return_items (
      user_id,
      workspace_id,
      return_id,
      sale_item_id,
      product_id,
      quantity,
      restockable
    )
    values (
      current_user_id,
      sale_row.workspace_id,
      return_id,
      sale_item_row.id,
      sale_item_row.product_id,
      requested_quantity,
      restockable
    );

    remaining_quantity := requested_quantity;

    for allocation_row in
      select
        allocation.id,
        allocation.inventory_lot_id,
        allocation.quantity,
        allocation.returned_quantity,
        allocation.unit_cost,
        lot.product_id
      from public.business_sale_item_allocations allocation
      join public.business_inventory_lots lot
        on lot.id = allocation.inventory_lot_id
        and lot.user_id = allocation.user_id
        and lot.workspace_id = allocation.workspace_id
      where allocation.sale_item_id = sale_item_row.id
        and allocation.user_id = current_user_id
        and allocation.workspace_id = sale_row.workspace_id
        and allocation.status in ('CONSUMED', 'RETURNED')
        and allocation.returned_quantity < allocation.quantity
      order by allocation.created_at, allocation.id
      for update of allocation, lot
    loop
      exit when remaining_quantity <= 0;
      alloc_return_quantity := least(remaining_quantity, allocation_row.quantity - allocation_row.returned_quantity);

      if restockable then
        update public.business_inventory_lots
        set remaining_quantity = public.business_inventory_lots.remaining_quantity + alloc_return_quantity
        where id = allocation_row.inventory_lot_id;

        insert into public.business_inventory_movements (
          user_id,
          workspace_id,
          product_id,
          inventory_lot_id,
          movement_type,
          quantity_delta,
          unit_cost,
          total_cost,
          reference_type,
          reference_id
        )
        values (
          current_user_id,
          sale_row.workspace_id,
          allocation_row.product_id,
          allocation_row.inventory_lot_id,
          'CUSTOMER_RETURN',
          alloc_return_quantity,
          allocation_row.unit_cost,
          round(alloc_return_quantity * allocation_row.unit_cost, 2),
          'sale_return',
          return_id
        );
      end if;

      update public.business_sale_item_allocations
      set returned_quantity = returned_quantity + alloc_return_quantity,
          status = case when returned_quantity + alloc_return_quantity = quantity then 'RETURNED' else status end
      where id = allocation_row.id;

      remaining_quantity := remaining_quantity - alloc_return_quantity;
      total_returned := total_returned + alloc_return_quantity;
    end loop;

    if remaining_quantity > 0 then
      raise exception 'Nao ha alocacoes entregues suficientes para devolucao';
    end if;
  end loop;

  if coalesce(p_refund_amount, 0) > 0 then
    response := public.record_business_payment(sale_row.id, p_refund_amount, p_idempotency_key || ':refund', 'devolucao', 'REFUNDED', now(), p_notes);
  else
    next_payment_status := sale_row.payment_status;
  end if;

  select coalesce(sum(quantity), 0)
    into total_sale_quantity
  from public.business_sale_items
  where sale_id = sale_row.id
    and user_id = current_user_id
    and workspace_id = sale_row.workspace_id;

  select coalesce(sum(quantity), 0)
    into total_returned_all_time
  from public.business_sale_return_items
  where user_id = current_user_id
    and workspace_id = sale_row.workspace_id
    and sale_item_id in (
      select id from public.business_sale_items where sale_id = sale_row.id
    );

  if total_returned_all_time >= total_sale_quantity then
    update public.business_sales
    set order_status = 'RETURNED'
    where id = sale_row.id;
  end if;

  perform public.business_log_audit(current_user_id, current_user_id, sale_row.workspace_id, 'sale', sale_row.id, 'sale_returned', jsonb_build_object('return_id', return_id, 'returned_quantity', total_returned, 'refund_amount', round(coalesce(p_refund_amount, 0), 2)));

  response := jsonb_build_object(
    'return_id', return_id,
    'sale_id', sale_row.id,
    'returned_quantity', total_returned,
    'refund_amount', round(coalesce(p_refund_amount, 0), 2),
    'status', case when total_returned_all_time >= total_sale_quantity then 'RETURNED' else sale_row.order_status end
  );
  perform public.business_complete_idempotency(current_user_id, sale_row.workspace_id, 'return_business_sale', p_idempotency_key, response);
  return response;
end;
$$;

create or replace function public.adjust_business_inventory(
  p_workspace_id uuid,
  p_product_id uuid,
  p_quantity_delta integer,
  p_movement_type text,
  p_reason text,
  p_idempotency_key text,
  p_unit_cost numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  remaining_to_adjust integer;
  adjust_quantity integer;
  lot_row public.business_inventory_lots%rowtype;
  lot_id uuid;
  request_hash text;
  existing_response jsonb;
  response jsonb;
  adjusted_quantity integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  request_hash := md5(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'product_id', p_product_id,
    'quantity_delta', p_quantity_delta,
    'movement_type', p_movement_type,
    'reason', p_reason,
    'unit_cost', p_unit_cost
  )::text);
  existing_response := public.business_claim_idempotency(current_user_id, p_workspace_id, 'adjust_business_inventory', p_idempotency_key, request_hash);
  if existing_response is not null then
    return existing_response;
  end if;

  if not exists (
    select 1 from public.business_products
    where id = p_product_id
      and user_id = current_user_id
      and workspace_id = p_workspace_id
      and active = true
  ) then
    raise exception 'Produto nao encontrado';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Ajuste precisa ter quantidade diferente de zero';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Motivo do ajuste e obrigatorio';
  end if;
  if p_unit_cost < 0 then
    raise exception 'Custo unitario nao pode ser negativo';
  end if;

  if p_movement_type is null then
    raise exception 'Tipo de movimento e obrigatorio';
  end if;
  if p_quantity_delta > 0 and p_movement_type <> 'ADJUSTMENT_IN' then
    raise exception 'Ajuste positivo precisa ser ADJUSTMENT_IN';
  end if;
  if p_quantity_delta < 0 and p_movement_type not in ('ADJUSTMENT_OUT', 'LOSS', 'DAMAGED') then
    raise exception 'Ajuste negativo precisa ser ADJUSTMENT_OUT, LOSS ou DAMAGED';
  end if;

  if p_quantity_delta > 0 then
    insert into public.business_inventory_lots (
      user_id,
      workspace_id,
      product_id,
      purchase_item_id,
      received_quantity,
      remaining_quantity,
      unit_cost
    )
    values (
      current_user_id,
      p_workspace_id,
      p_product_id,
      null,
      p_quantity_delta,
      p_quantity_delta,
      round(coalesce(p_unit_cost, 0), 2)
    )
    returning id into lot_id;

    insert into public.business_inventory_movements (
      user_id,
      workspace_id,
      product_id,
      inventory_lot_id,
      movement_type,
      quantity_delta,
      unit_cost,
      total_cost,
      reference_type,
      reference_id,
      notes
    )
    values (
      current_user_id,
      p_workspace_id,
      p_product_id,
      lot_id,
      'ADJUSTMENT_IN',
      p_quantity_delta,
      round(coalesce(p_unit_cost, 0), 2),
      round(p_quantity_delta * coalesce(p_unit_cost, 0), 2),
      'inventory_adjustment',
      lot_id,
      nullif(trim(p_reason), '')
    );

    adjusted_quantity := p_quantity_delta;
  else
    remaining_to_adjust := abs(p_quantity_delta);

    for lot_row in
      select *
      from public.business_inventory_lots
      where user_id = current_user_id
        and workspace_id = p_workspace_id
        and product_id = p_product_id
        and remaining_quantity - reserved_quantity > 0
      order by received_at, id
      for update
    loop
      exit when remaining_to_adjust <= 0;
      adjust_quantity := least(remaining_to_adjust, lot_row.remaining_quantity - lot_row.reserved_quantity);

      update public.business_inventory_lots
      set remaining_quantity = remaining_quantity - adjust_quantity
      where id = lot_row.id;

      insert into public.business_inventory_movements (
        user_id,
        workspace_id,
        product_id,
        inventory_lot_id,
        movement_type,
        quantity_delta,
        unit_cost,
        total_cost,
        reference_type,
        reference_id,
        notes
      )
      values (
        current_user_id,
        p_workspace_id,
        p_product_id,
        lot_row.id,
        p_movement_type,
        -adjust_quantity,
        lot_row.unit_cost,
        round(adjust_quantity * lot_row.unit_cost, 2),
        'inventory_adjustment',
        lot_row.id,
        nullif(trim(p_reason), '')
      );

      remaining_to_adjust := remaining_to_adjust - adjust_quantity;
      adjusted_quantity := adjusted_quantity + adjust_quantity;
    end loop;

    if remaining_to_adjust > 0 then
      raise exception 'Ajuste deixaria estoque disponivel negativo';
    end if;
  end if;

  perform public.business_log_audit(current_user_id, current_user_id, p_workspace_id, 'product', p_product_id, 'inventory_adjusted', jsonb_build_object('quantity_delta', p_quantity_delta, 'movement_type', p_movement_type, 'reason', nullif(trim(p_reason), '')));

  response := jsonb_build_object('product_id', p_product_id, 'adjusted_quantity', adjusted_quantity, 'movement_type', p_movement_type);
  perform public.business_complete_idempotency(current_user_id, p_workspace_id, 'adjust_business_inventory', p_idempotency_key, response);
  return response;
end;
$$;

create or replace function public.record_business_expense(
  p_workspace_id uuid,
  p_description text,
  p_category text,
  p_amount numeric,
  p_idempotency_key text,
  p_spent_at date default current_date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  expense_id uuid;
  request_hash text;
  existing_response jsonb;
  response jsonb;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;
  perform public.business_assert_workspace(p_workspace_id, current_user_id);

  request_hash := md5(jsonb_build_object(
    'workspace_id', p_workspace_id,
    'description', p_description,
    'category', p_category,
    'amount', p_amount,
    'spent_at', p_spent_at,
    'notes', p_notes
  )::text);
  existing_response := public.business_claim_idempotency(current_user_id, p_workspace_id, 'record_business_expense', p_idempotency_key, request_hash);
  if existing_response is not null then
    return existing_response;
  end if;

  if nullif(trim(p_description), '') is null or p_amount is null or p_amount <= 0 then
    raise exception 'Despesa invalida';
  end if;
  if p_category is null or p_category not in ('gasolina', 'embalagem', 'anuncios', 'entrega', 'manutencao', 'taxas', 'outras') then
    raise exception 'Categoria de despesa invalida';
  end if;

  insert into public.business_expenses (user_id, workspace_id, description, category, amount, spent_at, notes)
  values (current_user_id, p_workspace_id, trim(p_description), p_category, round(p_amount, 2), coalesce(p_spent_at, current_date), nullif(trim(p_notes), ''))
  returning id into expense_id;

  perform public.business_log_audit(current_user_id, current_user_id, p_workspace_id, 'business_expense', expense_id, 'expense_recorded', jsonb_build_object('amount', round(p_amount, 2), 'category', p_category));

  response := jsonb_build_object('expense_id', expense_id, 'amount', round(p_amount, 2));
  perform public.business_complete_idempotency(current_user_id, p_workspace_id, 'record_business_expense', p_idempotency_key, response);
  return response;
end;
$$;

revoke execute on function public.business_assert_workspace(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.business_claim_idempotency(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.business_complete_idempotency(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.business_log_audit(uuid, uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.business_refresh_sale_payment_status(uuid, uuid, uuid) from public, anon, authenticated;

revoke execute on function public.create_business_purchase(uuid, uuid, integer, numeric, text, numeric, numeric, date, date, text, text) from public, anon;
revoke execute on function public.update_business_purchase(uuid, text, integer, numeric, numeric, numeric, date, date, text, text) from public, anon;
revoke execute on function public.receive_business_purchase(uuid, text, integer) from public, anon;
revoke execute on function public.create_business_sale(uuid, jsonb, text, uuid, timestamptz, text, boolean) from public, anon;
revoke execute on function public.reserve_business_sale(uuid, text) from public, anon;
revoke execute on function public.deliver_business_sale(uuid, text) from public, anon;
revoke execute on function public.cancel_business_sale(uuid, text) from public, anon;
revoke execute on function public.record_business_payment(uuid, numeric, text, text, text, timestamptz, text) from public, anon;
revoke execute on function public.return_business_sale(uuid, jsonb, text, numeric, text) from public, anon;
revoke execute on function public.adjust_business_inventory(uuid, uuid, integer, text, text, text, numeric) from public, anon;
revoke execute on function public.record_business_expense(uuid, text, text, numeric, text, date, text) from public, anon;

grant execute on function public.create_business_purchase(uuid, uuid, integer, numeric, text, numeric, numeric, date, date, text, text) to authenticated;
grant execute on function public.update_business_purchase(uuid, text, integer, numeric, numeric, numeric, date, date, text, text) to authenticated;
grant execute on function public.receive_business_purchase(uuid, text, integer) to authenticated;
grant execute on function public.create_business_sale(uuid, jsonb, text, uuid, timestamptz, text, boolean) to authenticated;
grant execute on function public.reserve_business_sale(uuid, text) to authenticated;
grant execute on function public.deliver_business_sale(uuid, text) to authenticated;
grant execute on function public.cancel_business_sale(uuid, text) to authenticated;
grant execute on function public.record_business_payment(uuid, numeric, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.return_business_sale(uuid, jsonb, text, numeric, text) to authenticated;
grant execute on function public.adjust_business_inventory(uuid, uuid, integer, text, text, text, numeric) to authenticated;
grant execute on function public.record_business_expense(uuid, text, text, numeric, text, date, text) to authenticated;
