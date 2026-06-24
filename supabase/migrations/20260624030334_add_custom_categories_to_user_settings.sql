alter table public.user_settings
  add column if not exists custom_categories jsonb not null default '[]'::jsonb;
