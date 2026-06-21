-- Produtos e variações
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  category text not null default 'acai',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,
  price numeric(10,2) not null check (price >= 0)
);

create table if not exists additionals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null default 0 check (price >= 0),
  stock_quantity integer,
  active boolean not null default true
);

alter table products enable row level security;
alter table product_sizes enable row level security;
alter table additionals enable row level security;

-- Helper: verifica se o usuário autenticado é admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable set search_path = public;

-- Leitura pública de produtos/tamanhos/adicionais ativos
create policy "Anyone can view active products"
  on products for select
  using (active = true or public.is_admin());

create policy "Admins can manage products"
  on products for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Anyone can view sizes of visible products"
  on product_sizes for select
  using (
    exists (
      select 1 from products
      where products.id = product_sizes.product_id
        and (products.active = true or public.is_admin())
    )
  );

create policy "Admins can manage product sizes"
  on product_sizes for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Anyone can view active additionals"
  on additionals for select
  using (active = true or public.is_admin());

create policy "Admins can manage additionals"
  on additionals for all
  using (public.is_admin())
  with check (public.is_admin());
