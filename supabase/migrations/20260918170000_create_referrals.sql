-- ============================================================
-- REFERRALS - Sistema de indicacao
-- Fase 1: codigo por usuario + atribuicao de signup
-- Fase 2 (futura): comissao sobre purchase
-- ============================================================

-- ============================================================
-- 1. TABELA: referral_codes (1 codigo unico por usuario)
-- ============================================================

create table public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique
    references auth.users(id) on delete cascade,
  code text not null unique
    check (length(code) between 4 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index referral_codes_user_id_idx
  on public.referral_codes (user_id);

alter table public.referral_codes enable row level security;

revoke all on table public.referral_codes
  from public, anon, authenticated;


-- ============================================================
-- 2. TABELA: referrals (atribuicao de signup)
-- ============================================================

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null
    references auth.users(id) on delete cascade,
  referred_user_id uuid not null unique
    references auth.users(id) on delete cascade,
  referral_code text not null,
  attributed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint referrals_no_self_referral
    check (referrer_user_id <> referred_user_id)
);

create index referrals_referrer_idx
  on public.referrals (referrer_user_id);

create index referrals_referred_idx
  on public.referrals (referred_user_id);

alter table public.referrals enable row level security;

revoke all on table public.referrals
  from public, anon, authenticated;


-- ============================================================
-- 3. TRIGGER: updated_at em referral_codes
-- ============================================================

create trigger set_referral_codes_updated_at
before update on public.referral_codes
for each row
execute function public.set_entitlement_updated_at();


-- ============================================================
-- 4. FUNCAO INTERNA: gerar codigo aleatorio unico
-- ============================================================

create or replace function public.generate_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  attempt integer := 0;
  code_length integer := 8;
  i integer;
begin
  loop
    attempt := attempt + 1;
    if attempt > 50 then
      raise exception 'Nao foi possivel gerar codigo unico apos 50 tentativas';
    end if;

    candidate := '';
    for i in 1..code_length loop
      candidate := candidate || substr(
        alphabet,
        floor(random() * length(alphabet) + 1)::integer,
        1
      );
    end loop;

    exit when not exists (
      select 1 from public.referral_codes where code = candidate
    );
  end loop;

  return candidate;
end;
$$;

revoke all on function public.generate_referral_code()
  from public, anon, authenticated;

comment on function public.generate_referral_code() is
  'Gera um codigo de referral aleatorio unico de 8 caracteres.';


-- ============================================================
-- 5. RPC: get_or_create_my_referral_code
-- ============================================================

create or replace function public.get_or_create_my_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_code text;
  new_code text;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select code into existing_code
  from public.referral_codes
  where user_id = current_user_id;

  if existing_code is not null then
    return existing_code;
  end if;

  new_code := public.generate_referral_code();

  insert into public.referral_codes (user_id, code)
  values (current_user_id, new_code)
  on conflict (user_id) do update
    set updated_at = now()
  returning code into new_code;

  return new_code;
end;
$$;

revoke all on function public.get_or_create_my_referral_code()
  from public, anon;

grant execute on function public.get_or_create_my_referral_code()
  to authenticated;

comment on function public.get_or_create_my_referral_code() is
  'Retorna o codigo de referral do usuario, criando um novo se nao existir.';


-- ============================================================
-- 6. RPC INTERNA: attribute_referral_signup (service_role)
-- ============================================================

create or replace function public.attribute_referral_signup(
  p_referral_code text,
  p_referred_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_code text;
  referrer_id uuid;
  referral_id uuid;
  existing_referral_id uuid;
begin
  if p_referred_user_id is null then
    raise exception 'p_referred_user_id obrigatorio';
  end if;

  clean_code := upper(trim(coalesce(p_referral_code, '')));

  if length(clean_code) = 0 then
    raise exception 'p_referral_code obrigatorio';
  end if;

  -- Verifica se usuario ja foi atribuido antes (idempotencia)
  select id into existing_referral_id
  from public.referrals
  where referred_user_id = p_referred_user_id;

  if existing_referral_id is not null then
    return existing_referral_id;
  end if;

  -- Busca o referrer pelo codigo
  select user_id into referrer_id
  from public.referral_codes
  where code = clean_code;

  if referrer_id is null then
    raise exception 'Codigo de referral invalido: %', clean_code;
  end if;

  -- Bloqueia autoindicacao
  if referrer_id = p_referred_user_id then
    raise exception 'Autoindicacao nao permitida';
  end if;

  insert into public.referrals (
    referrer_user_id,
    referred_user_id,
    referral_code
  )
  values (referrer_id, p_referred_user_id, clean_code)
  returning id into referral_id;

  return referral_id;
end;
$$;

revoke all on function public.attribute_referral_signup(
  text, uuid
) from public, anon, authenticated;

comment on function public.attribute_referral_signup(text, uuid) is
  'Atribui um novo usuario ao codigo de indicacao. Apenas service_role. Idempotente por referred_user_id.';


-- ============================================================
-- 7. RPC: list_my_referrals
-- ============================================================

create or replace function public.list_my_referrals()
returns table (
  referral_id uuid,
  referred_user_id uuid,
  referral_code text,
  attributed_at timestamptz
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
    r.referred_user_id,
    r.referral_code,
    r.attributed_at
  from public.referrals as r
  where r.referrer_user_id = current_user_id
  order by r.attributed_at desc;
end;
$$;

revoke all on function public.list_my_referrals()
  from public, anon;

grant execute on function public.list_my_referrals()
  to authenticated;

comment on function public.list_my_referrals() is
  'Lista os indicados do usuario autenticado.';


-- ============================================================
-- 8. RPC: get_my_referral_stats
-- ============================================================

create or replace function public.get_my_referral_stats()
returns table (
  total_signups integer,
  total_bonus_grants integer,
  last_signup_at timestamptz
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
    count(distinct r.id)::integer,
    count(distinct g.id)::integer,
    max(r.attributed_at)
  from public.referrals as r
  left join public.entitlement_grants as g
    on g.user_id = current_user_id
   and g.source = 'referral'
   and g.metadata->>'referral_id' = r.id::text
  where r.referrer_user_id = current_user_id;
end;
$$;

revoke all on function public.get_my_referral_stats()
  from public, anon;

grant execute on function public.get_my_referral_stats()
  to authenticated;

comment on function public.get_my_referral_stats() is
  'Estatisticas agregadas de indicacoes do usuario autenticado.';


-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
