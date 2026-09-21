-- ============================================================
-- ATTRIBUTE MY REFERRAL - RPC authenticated
-- Permite que o proprio user atribua seu referral no signup
-- (nao expoe o referral de outros users)
-- ============================================================

create or replace function public.attribute_my_referral(
  p_referral_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clean_code text;
  referrer_id uuid;
  referral_id uuid;
  existing_referral_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  clean_code := upper(trim(coalesce(p_referral_code, '')));

  if length(clean_code) = 0 then
    raise exception 'p_referral_code obrigatorio';
  end if;

  -- Se user ja foi atribuido, retorna o existente (idempotente)
  select id into existing_referral_id
  from public.referrals
  where referred_user_id = current_user_id;

  if existing_referral_id is not null then
    return existing_referral_id;
  end if;

  -- Busca o referrer
  select user_id into referrer_id
  from public.referral_codes
  where code = clean_code;

  if referrer_id is null then
    raise exception 'Codigo de referral invalido: %', clean_code;
  end if;

  -- Bloqueia autoindicacao
  if referrer_id = current_user_id then
    raise exception 'Autoindicacao nao permitida';
  end if;

  insert into public.referrals (
    referrer_user_id,
    referred_user_id,
    referral_code
  )
  values (referrer_id, current_user_id, clean_code)
  returning id into referral_id;

  return referral_id;
end;
$$;

revoke all on function public.attribute_my_referral(text)
  from public, anon;

grant execute on function public.attribute_my_referral(text)
  to authenticated;

comment on function public.attribute_my_referral(text) is
  'Atribui o usuario autenticado a um codigo de indicacao. Idempotente.';
