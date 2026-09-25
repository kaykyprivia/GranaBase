-- ============================================================
-- SUPPORT REQUESTS
-- ============================================================

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('bug', 'suggestion', 'question', 'billing', 'other')),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_requests_user_id
  on public.support_requests(user_id, created_at desc);

create index if not exists idx_support_requests_status
  on public.support_requests(status, created_at desc);

alter table public.support_requests enable row level security;

drop policy if exists "users can read own support_requests" on public.support_requests;
create policy "users can read own support_requests"
  on public.support_requests for select
  using (auth.uid() = user_id);

drop policy if exists "super admins can read all support_requests" on public.support_requests;
create policy "super admins can read all support_requests"
  on public.support_requests for select
  using (public.is_super_admin());

-- ============================================================
-- RPC: submit_support_request
-- ============================================================

create or replace function public.submit_support_request(
  p_kind text,
  p_subject text,
  p_message text
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

  if p_kind not in ('bug', 'suggestion', 'question', 'billing', 'other') then
    raise exception 'Tipo invalido: %', p_kind;
  end if;

  if p_subject is null or length(trim(p_subject)) < 3 then
    raise exception 'Assunto muito curto';
  end if;

  if p_message is null or length(trim(p_message)) < 10 then
    raise exception 'Mensagem muito curta';
  end if;

  insert into public.support_requests (user_id, kind, subject, message)
  values (current_user_id, p_kind, trim(p_subject), trim(p_message))
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.submit_support_request(text, text, text)
  from public, anon;

grant execute on function public.submit_support_request(text, text, text)
  to authenticated;

comment on function public.submit_support_request(text, text, text) is
  'Registra uma solicitacao de suporte do usuario autenticado.';

-- ============================================================
-- RPC: list_my_support_requests
-- ============================================================

create or replace function public.list_my_support_requests()
returns table (
  id uuid,
  kind text,
  subject text,
  message text,
  status text,
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  select
    r.id,
    r.kind,
    r.subject,
    r.message,
    r.status,
    r.admin_notes,
    r.resolved_at,
    r.created_at
  from public.support_requests r
  where r.user_id = current_user_id
  order by r.created_at desc;
end;
$$;

revoke all on function public.list_my_support_requests()
  from public, anon;

grant execute on function public.list_my_support_requests()
  to authenticated;

comment on function public.list_my_support_requests() is
  'Lista as solicitacoes de suporte do usuario autenticado.';
