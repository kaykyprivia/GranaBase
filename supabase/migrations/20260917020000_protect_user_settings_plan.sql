create or replace function public.protect_user_settings_plan()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  -- Operacoes administrativas/backend sem usuario autenticado nao sao
  -- bloqueadas por este trigger. RLS continua protegendo clientes normais.
  if current_user_id is null then
    return new;
  end if;

  if new.user_id <> current_user_id then
    raise exception 'Usuario sem permissao para alterar estas configuracoes';
  end if;

  if tg_op = 'INSERT' then
    new.plan := 'free';
  elsif tg_op = 'UPDATE' and new.plan is distinct from old.plan then
    raise exception 'Plano nao pode ser alterado diretamente';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_user_settings_plan on public.user_settings;

create trigger protect_user_settings_plan
before insert or update on public.user_settings
for each row
execute function public.protect_user_settings_plan();
