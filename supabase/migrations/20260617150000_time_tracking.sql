create or replace function public.time_entries_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  work_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists time_entries_company_idx on public.time_entries (company_id);
create index if not exists time_entries_user_idx on public.time_entries (user_id);
create index if not exists time_entries_project_idx on public.time_entries (project_id);
create index if not exists time_entries_date_idx on public.time_entries (work_date);
drop trigger if exists time_entries_set_updated_at on public.time_entries;
create trigger time_entries_set_updated_at before update on public.time_entries
  for each row execute function public.time_entries_set_updated_at();
alter table public.time_entries enable row level security;
drop policy if exists "time_entries_select" on public.time_entries;
create policy "time_entries_select" on public.time_entries for select to authenticated
  using (
    user_id = auth.uid()
    or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin')
    or public.is_super_admin()
  );
drop policy if exists "time_entries_insert" on public.time_entries;
create policy "time_entries_insert" on public.time_entries for insert to authenticated
  with check (
    company_id in (select company_id from public.user_profiles where user_id = auth.uid())
    and (
      user_id = auth.uid()
      or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin')
      or public.is_super_admin()
    )
  );
drop policy if exists "time_entries_update" on public.time_entries;
create policy "time_entries_update" on public.time_entries for update to authenticated
  using (
    user_id = auth.uid()
    or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin')
    or public.is_super_admin()
  )
  with check (
    company_id in (select company_id from public.user_profiles where user_id = auth.uid())
    or public.is_super_admin()
  );
drop policy if exists "time_entries_delete" on public.time_entries;
create policy "time_entries_delete" on public.time_entries for delete to authenticated
  using (
    user_id = auth.uid()
    or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin')
    or public.is_super_admin()
  );
