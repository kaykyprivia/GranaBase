-- Human-friendly sequential sale numbers.
-- UUID remains the internal primary key.

alter table public.business_sales
  add column if not exists sale_number bigint;

-- Backfill existing sales in their creation order, independently per workspace.
with ranked_sales as (
  select
    id,
    row_number() over (
      partition by user_id, workspace_id
      order by created_at asc, id asc
    )::bigint as generated_number
  from public.business_sales
)
update public.business_sales sale
set sale_number = ranked.generated_number
from ranked_sales ranked
where ranked.id = sale.id
  and sale.sale_number is null;

alter table public.business_sales
  alter column sale_number set not null;

create unique index if not exists idx_business_sales_workspace_sale_number
  on public.business_sales(user_id, workspace_id, sale_number);

-- Internal counter. Keeping the counter separate makes allocation atomic
-- and prevents duplicate numbers when two sales are created simultaneously.
create table if not exists public.business_sale_number_sequences (
  user_id uuid not null,
  workspace_id uuid not null,
  next_number bigint not null check (next_number > 0),
  primary key (user_id, workspace_id)
);

alter table public.business_sale_number_sequences enable row level security;

revoke all on table public.business_sale_number_sequences
  from public, anon, authenticated;

-- Position counters immediately after the highest existing number.
insert into public.business_sale_number_sequences (
  user_id,
  workspace_id,
  next_number
)
select
  user_id,
  workspace_id,
  max(sale_number) + 1
from public.business_sales
group by user_id, workspace_id
on conflict (user_id, workspace_id)
do update
set next_number = greatest(
  public.business_sale_number_sequences.next_number,
  excluded.next_number
);

create or replace function public.business_assign_sale_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sale numbers are immutable after creation.
  if tg_op = 'UPDATE' then
    new.sale_number := old.sale_number;
    return new;
  end if;

  insert into public.business_sale_number_sequences as sequence_row (
    user_id,
    workspace_id,
    next_number
  )
  values (
    new.user_id,
    new.workspace_id,
    2
  )
  on conflict (user_id, workspace_id)
  do update
  set next_number = sequence_row.next_number + 1
  returning next_number - 1
  into new.sale_number;

  return new;
end;
$$;

revoke all on function public.business_assign_sale_number() from public;

drop trigger if exists business_sales_assign_sale_number
  on public.business_sales;

create trigger business_sales_assign_sale_number
before insert or update on public.business_sales
for each row
execute function public.business_assign_sale_number();
