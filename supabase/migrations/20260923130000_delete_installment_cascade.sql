-- ============================================================
-- delete_installment: cascata (apaga parcelas filhas)
-- ============================================================

create or replace function public.delete_installment(p_id uuid)
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

  delete from public.installment_payments
  where installment_id = p_id and user_id = current_user_id;

  delete from public.installments
  where id = p_id and user_id = current_user_id;

  if not found then
    raise exception 'Parcelamento nao encontrado';
  end if;
end;
$$;

revoke all on function public.delete_installment(uuid) from public, anon;
grant execute on function public.delete_installment(uuid) to authenticated;
