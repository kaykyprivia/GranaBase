-- Pedidos
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'preparing', 'delivering', 'delivered', 'cancelled')),
  zone text,
  delivery_fee numeric(10,2) not null default 0,
  subtotal numeric(10,2) not null default 0,
  cashback_used numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method text not null check (payment_method in ('pix', 'card', 'cash')),
  address_json jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  size_id uuid not null references product_sizes(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  additionals_json jsonb not null default '[]'
);

alter table orders enable row level security;
alter table order_items enable row level security;

create policy "Users can view own orders"
  on orders for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can create own orders"
  on orders for insert
  with check (auth.uid() = user_id);

create policy "Admins can update orders"
  on orders for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "Users can view items of own orders"
  on order_items for select
  using (
    exists (
      select 1 from orders
      where orders.id = order_items.order_id
        and (orders.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Users can create items for own orders"
  on order_items for insert
  with check (
    exists (
      select 1 from orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger set_orders_updated_at
  before update on orders
  for each row execute function public.set_updated_at();
