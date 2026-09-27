-- ============================================================
-- BUSINESS CUSTOMERS: RPCs + fechamento de writes diretos
-- ============================================================

-- 1. RPC: create_business_customer
create or replace function public.create_business_customer(
  p_workspace_id uuid,
  p_name text,
  p_whatsapp text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_workspace_id is null then
    raise exception 'p_workspace_id obrigatorio';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Nome obrigatorio';
  end if;

  if not exists (
    select 1 from public.business_workspaces
    where id = p_workspace_id and user_id = current_user_id
  ) then
    raise exception 'Workspace nao encontrado';
  end if;

  insert into public.business_customers (
    user_id, workspace_id, name, whatsapp, notes
  )
  values (
    current_user_id,
    p_workspace_id,
    trim(p_name),
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_business_customer(uuid, text, text, text)
  from public, anon;

grant execute on function public.create_business_customer(uuid, text, text, text)
  to authenticated;

comment on function public.create_business_customer(uuid, text, text, text) is
  'Cria cliente do negocio de forma atomica.';

-- 2. RPC: update_business_customer
create or replace function public.update_business_customer(
  p_customer_id uuid,
  p_name text,
  p_whatsapp text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if p_customer_id is null then
    raise exception 'p_customer_id obrigatorio';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Nome obrigatorio';
  end if;

  update public.business_customers
  set
    name = trim(p_name),
    whatsapp = nullif(trim(coalesce(p_whatsapp, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), ''),
    updated_at = now()
  where id = p_customer_id
    and user_id = current_user_id;

  if not found then
    raise exception 'Cliente nao encontrado';
  end if;
end;
$$;

revoke all on function public.update_business_customer(uuid, text, text, text)
  from public, anon;

grant execute on function public.update_business_customer(uuid, text, text, text)
  to authenticated;

comment on function public.update_business_customer(uuid, text, text, text) is
  'Atualiza cliente do negocio validando ownership.';

-- 3. Fechar policies de write direto (hardening)
drop policy if exists "users can insert own business_customers" on public.business_customers;
drop policy if exists "users can update own business_customers" on public.business_customers;

drop policy if exists "users can insert own business_workspaces" on public.business_workspaces;
drop policy if exists "users can update own business_workspaces" on public.business_workspaces;

drop policy if exists "users can insert own business_products" on public.business_products;
drop policy if exists "users can update own business_products" on public.business_products;

drop policy if exists "users can insert own business_product_categories" on public.business_product_categories;
drop policy if exists "users can update own business_product_categories" on public.business_product_categories;
