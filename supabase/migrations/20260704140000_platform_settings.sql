-- Reconcile: platform_settings key/value primitive (super-admin write, authenticated read).
-- Applied live in SQL Editor on 2026-07-04; this file keeps the repo in sync.
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default 'false'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings
  for select to authenticated using (true);
drop policy if exists platform_settings_write on public.platform_settings;
create policy platform_settings_write on public.platform_settings
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
insert into public.platform_settings (key, value)
values ('subscribe_button_enabled', 'false'::jsonb)
on conflict (key) do nothing;
