-- User Management RLS Migration
-- Helper functions + tenant-scoped policies for user_profiles and client_errors

-- Helper: get current user's company_id from their profile
create or replace function public.current_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.user_profiles
  where user_id = auth.uid() and deleted_at is null
  limit 1;
$$;

-- Helper: is current user a super admin
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'email' = 'main@ngautomationhub.com', false);
$$;

-- Helper: is current user a contractor_admin
create or replace function public.is_contractor_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = auth.uid()
      and role = 'contractor_admin'
      and deleted_at is null
  );
$$;

-- Helper: get last login from auth.users (security definer so client can call it)
create or replace function public.get_user_last_login(p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select last_sign_in_at from auth.users where id = p_user_id;
$$;

revoke all on function public.get_user_last_login(uuid) from public;
grant execute on function public.get_user_last_login(uuid) to authenticated;

-- Drop existing SELECT/UPDATE policies on user_profiles to rebuild cleanly
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where tablename = 'user_profiles' and cmd in ('SELECT', 'UPDATE')
  loop
    execute format('drop policy if exists %I on public.user_profiles', pol.policyname);
  end loop;
end $$;

-- SELECT: user reads own row, contractor_admin reads same-tenant, super_admin reads all
create policy "user_profiles_select_own_or_admin"
  on public.user_profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or (public.is_contractor_admin() and company_id = public.current_user_company_id())
  );

-- UPDATE: user updates own profile, contractor_admin updates same-tenant, super_admin updates all
create policy "user_profiles_update_own_or_admin"
  on public.user_profiles
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or (public.is_contractor_admin() and company_id = public.current_user_company_id())
  )
  with check (
    user_id = auth.uid()
    or public.is_super_admin()
    or (public.is_contractor_admin() and company_id = public.current_user_company_id())
  );

-- client_errors SELECT scoping — admin sees their tenant's errors, super admin sees all
drop policy if exists "Super admin reads client_errors" on public.client_errors;
create policy "client_errors_select_admin"
  on public.client_errors
  for select
  to authenticated
  using (
    public.is_super_admin()
    or (public.is_contractor_admin() and tenant_id = public.current_user_company_id())
  );
