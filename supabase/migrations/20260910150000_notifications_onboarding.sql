-- GranaBase notifications foundation
-- Creates per-user notifications and onboarding messages only for future users.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_id_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "users can select own notifications"
  on public.notifications;

create policy "users can select own notifications"
  on public.notifications
  for select
  using (auth.uid() = user_id);

drop policy if exists "users can update own notifications"
  on public.notifications;

create or replace function public.mark_notification_read(notification_id uuid)
returns void
language sql
security definer
set search_path = public
as $
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = notification_id
    and user_id = auth.uid();
$;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = public
as $
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null;
$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict do nothing;

  insert into public.notifications (
    user_id,
    title,
    message,
    notification_type
  )
  values
    (
      new.id,
      'Bem-vindo ao GranaBase!',
      'Que bom ter você por aqui. Organize suas finanças, acompanhe seus gastos e comece a construir uma vida financeira mais organizada.',
      'welcome'
    ),
    (
      new.id,
      'Seus 7 dias grátis começaram!',
      'Você tem 7 dias de acesso gratuito para conhecer e utilizar o GranaBase. Aproveite esse período para explorar todos os recursos disponíveis.',
      'trial'
    );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
