create or replace function public.time_entries_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create table if not exists public.crew_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  user_id uuid references public.users(id) on delete set null,
  cost_rate numeric(10,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crew_members_company_idx on public.crew_members (company_id);
create index if not exists crew_members_user_idx on public.crew_members (user_id);
create unique index if not exists crew_members_company_user_uniq on public.crew_members (company_id, user_id) where user_id is not null;
drop trigger if exists crew_members_set_updated_at on public.crew_members;
create trigger crew_members_set_updated_at before update on public.crew_members for each row execute function public.time_entries_set_updated_at();
alter table public.crew_members enable row level security;
drop policy if exists "crew_members_select" on public.crew_members;
create policy "crew_members_select" on public.crew_members for select to authenticated
using (company_id in (select company_id from public.user_profiles where user_id = auth.uid()) or public.is_super_admin());
drop policy if exists "crew_members_insert" on public.crew_members;
create policy "crew_members_insert" on public.crew_members for insert to authenticated
with check (public.is_super_admin() or (company_id in (select company_id from public.user_profiles where user_id = auth.uid()) and (company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin') or user_id = auth.uid())));
drop policy if exists "crew_members_update" on public.crew_members;
create policy "crew_members_update" on public.crew_members for update to authenticated
using (public.is_super_admin() or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin'))
with check (public.is_super_admin() or company_id in (select company_id from public.user_profiles where user_id = auth.uid()));
drop policy if exists "crew_members_delete" on public.crew_members;
create policy "crew_members_delete" on public.crew_members for delete to authenticated
using (public.is_super_admin() or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin'));
insert into public.crew_members (company_id, name, user_id)
select up.company_id, coalesce(nullif(trim(up.full_name), ''), 'Team member'), up.user_id
from public.user_profiles up
where up.company_id is not null
  and not exists (select 1 from public.crew_members cm where cm.user_id = up.user_id and cm.company_id = up.company_id);
alter table public.time_entries add column if not exists crew_member_id uuid references public.crew_members(id) on delete restrict;
alter table public.time_entries add column if not exists logged_by uuid references public.users(id) on delete set null default auth.uid();
drop policy if exists "time_entries_select" on public.time_entries;
drop policy if exists "time_entries_insert" on public.time_entries;
drop policy if exists "time_entries_update" on public.time_entries;
drop policy if exists "time_entries_delete" on public.time_entries;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'time_entries' and column_name = 'user_id') then
    update public.time_entries te set crew_member_id = cm.id from public.crew_members cm
      where cm.user_id = te.user_id and cm.company_id = te.company_id and te.crew_member_id is null;
    update public.time_entries set logged_by = user_id where logged_by is null;
    alter table public.time_entries drop column user_id;
  end if;
end $$;
alter table public.time_entries alter column crew_member_id set not null;
create index if not exists time_entries_crew_idx on public.time_entries (crew_member_id);
create policy "time_entries_select" on public.time_entries for select to authenticated
using (public.is_super_admin() or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin') or crew_member_id in (select id from public.crew_members where user_id = auth.uid()));
create policy "time_entries_insert" on public.time_entries for insert to authenticated
with check (company_id in (select company_id from public.user_profiles where user_id = auth.uid()) and (public.is_super_admin() or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin') or crew_member_id in (select id from public.crew_members where user_id = auth.uid())));
create policy "time_entries_update" on public.time_entries for update to authenticated
using (public.is_super_admin() or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin') or crew_member_id in (select id from public.crew_members where user_id = auth.uid()))
with check (public.is_super_admin() or company_id in (select company_id from public.user_profiles where user_id = auth.uid()));
create policy "time_entries_delete" on public.time_entries for delete to authenticated
using (public.is_super_admin() or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin') or crew_member_id in (select id from public.crew_members where user_id = auth.uid()));
