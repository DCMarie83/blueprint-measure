-- Build 2: expenses foundation + labor rate snapshot on time entries.

alter table public.time_entries
  add column if not exists cost_rate numeric(10,2);

update public.time_entries te
set cost_rate = cm.cost_rate
from public.crew_members cm
where te.crew_member_id = cm.id
  and te.cost_rate is null;

create or replace function public.set_time_entry_cost_rate()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.cost_rate is null then
    select cost_rate into new.cost_rate
    from public.crew_members
    where id = new.crew_member_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_time_entries_cost_rate on public.time_entries;
create trigger trg_time_entries_cost_rate
  before insert on public.time_entries
  for each row execute function public.set_time_entry_cost_rate();

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null default 'other'
    check (category in ('material','labor','subcontractor','equipment','permit','other')),
  description text not null,
  amount numeric(12,2) not null default 0,
  expense_date date not null default current_date,
  vendor text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expenses_project on public.expenses(project_id);
create index if not exists idx_expenses_company_date on public.expenses(company_id, expense_date);

alter table public.expenses enable row level security;

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert
  with check ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete
  using ((company_id in (select company_id from public.user_profiles where user_id = auth.uid())) or is_super_admin());

create or replace function public.expenses_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.expenses_set_updated_at();
