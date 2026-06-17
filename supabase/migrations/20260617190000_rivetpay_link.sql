-- RivetPay Link: per-contractor public clock-in/out with admin approval. Re-runnable.
alter table public.crew_members add column if not exists link_token text unique default gen_random_uuid()::text;
alter table public.crew_members add column if not exists link_enabled boolean not null default true;
alter table public.crew_members add column if not exists phone text;
alter table public.crew_members add column if not exists link_terms_accepted_at timestamptz;
update public.crew_members set link_token = gen_random_uuid()::text where link_token is null;
alter table public.crew_members alter column link_token set not null;

create table if not exists public.time_punch_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  crew_member_id uuid not null references public.crew_members(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_in_lat numeric(9,6),
  clock_in_lng numeric(9,6),
  clock_out_at timestamptz,
  clock_out_lat numeric(9,6),
  clock_out_lng numeric(9,6),
  hours numeric(5,2),
  description text,
  status text not null default 'open' check (status in ('open','submitted','approved','rejected')),
  source text not null default 'clock' check (source in ('clock','manual')),
  approved_entry_id uuid references public.time_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tps_company_idx on public.time_punch_submissions (company_id, status);
create index if not exists tps_crew_idx on public.time_punch_submissions (crew_member_id);
create unique index if not exists tps_one_open_per_worker on public.time_punch_submissions (crew_member_id) where status = 'open';
drop trigger if exists tps_set_updated_at on public.time_punch_submissions;
create trigger tps_set_updated_at before update on public.time_punch_submissions
  for each row execute function public.time_entries_set_updated_at();

alter table public.time_punch_submissions enable row level security;
drop policy if exists "tps_select" on public.time_punch_submissions;
create policy "tps_select" on public.time_punch_submissions for select to authenticated
using (
  public.is_super_admin()
  or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin')
  or crew_member_id in (select id from public.crew_members where user_id = auth.uid())
);
drop policy if exists "tps_update" on public.time_punch_submissions;
create policy "tps_update" on public.time_punch_submissions for update to authenticated
using (
  public.is_super_admin()
  or company_id in (select company_id from public.user_profiles where user_id = auth.uid() and role = 'contractor_admin')
)
with check (
  public.is_super_admin()
  or company_id in (select company_id from public.user_profiles where user_id = auth.uid())
);

create or replace function public.rivetpay_get_link(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_crew record; v_jobs jsonb; v_open jsonb;
begin
  select cm.id, cm.name, cm.company_id, cm.link_enabled, cm.link_terms_accepted_at, co.name as company_name
    into v_crew
  from crew_members cm join companies co on co.id = cm.company_id
  where cm.link_token = p_token;
  if v_crew.id is null then return jsonb_build_object('valid', false); end if;
  if v_crew.link_enabled = false then return jsonb_build_object('valid', false, 'disabled', true); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name), '[]'::jsonb)
    into v_jobs
  from projects p
  where p.company_id = v_crew.company_id and p.status = 'active' and p.deleted_at is null;
  select to_jsonb(t) into v_open from (
    select s.id, s.project_id, pr.name as project_name, s.clock_in_at
    from time_punch_submissions s join projects pr on pr.id = s.project_id
    where s.crew_member_id = v_crew.id and s.status = 'open' limit 1
  ) t;
  return jsonb_build_object(
    'valid', true, 'worker_name', v_crew.name, 'company_name', v_crew.company_name,
    'terms_accepted', v_crew.link_terms_accepted_at is not null, 'jobs', v_jobs, 'open_punch', v_open
  );
end; $$;
grant execute on function public.rivetpay_get_link(text) to anon, authenticated;

create or replace function public.rivetpay_accept_terms(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update crew_members set link_terms_accepted_at = now()
  where link_token = p_token and link_enabled = true and link_terms_accepted_at is null
  returning id into v_id;
  return jsonb_build_object('ok', v_id is not null);
end; $$;
grant execute on function public.rivetpay_accept_terms(text) to anon, authenticated;

create or replace function public.rivetpay_clock_in(p_token text, p_project_id uuid, p_lat numeric, p_lng numeric, p_description text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_crew record; v_id uuid;
begin
  select id, company_id into v_crew from crew_members where link_token = p_token and link_enabled = true;
  if v_crew.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if not exists (select 1 from projects where id = p_project_id and company_id = v_crew.company_id and status = 'active' and deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'bad_job');
  end if;
  if exists (select 1 from time_punch_submissions where crew_member_id = v_crew.id and status = 'open') then
    return jsonb_build_object('ok', false, 'error', 'already_open');
  end if;
  insert into time_punch_submissions (company_id, crew_member_id, project_id, clock_in_at, clock_in_lat, clock_in_lng, description, status, source)
  values (v_crew.company_id, v_crew.id, p_project_id, now(), p_lat, p_lng, nullif(p_description,''), 'open', 'clock')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.rivetpay_clock_in(text, uuid, numeric, numeric, text) to anon, authenticated;

create or replace function public.rivetpay_clock_out(p_token text, p_lat numeric, p_lng numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_crew record; v_open record; v_hours numeric(5,2);
begin
  select id, company_id into v_crew from crew_members where link_token = p_token and link_enabled = true;
  if v_crew.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select id, clock_in_at into v_open from time_punch_submissions where crew_member_id = v_crew.id and status = 'open' limit 1;
  if v_open.id is null then return jsonb_build_object('ok', false, 'error', 'no_open'); end if;
  v_hours := round(extract(epoch from (now() - v_open.clock_in_at)) / 3600.0, 2);
  if v_hours <= 0 then v_hours := 0.01; end if;
  if v_hours > 24 then v_hours := 24; end if;
  update time_punch_submissions
    set clock_out_at = now(), clock_out_lat = p_lat, clock_out_lng = p_lng, hours = v_hours, status = 'submitted'
  where id = v_open.id;
  return jsonb_build_object('ok', true, 'hours', v_hours);
end; $$;
grant execute on function public.rivetpay_clock_out(text, numeric, numeric) to anon, authenticated;

create or replace function public.rivetpay_submit_manual(p_token text, p_project_id uuid, p_work_date date, p_hours numeric, p_description text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_crew record; v_id uuid;
begin
  select id, company_id into v_crew from crew_members where link_token = p_token and link_enabled = true;
  if v_crew.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if not exists (select 1 from projects where id = p_project_id and company_id = v_crew.company_id and status = 'active' and deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'bad_job');
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then return jsonb_build_object('ok', false, 'error', 'bad_hours'); end if;
  insert into time_punch_submissions (company_id, crew_member_id, project_id, clock_in_at, hours, description, status, source)
  values (v_crew.company_id, v_crew.id, p_project_id, p_work_date::timestamptz, round(p_hours,2), nullif(p_description,''), 'submitted', 'manual')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.rivetpay_submit_manual(text, uuid, date, numeric, text) to anon, authenticated;

create or replace function public.rivetpay_approve_submission(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sub record; v_entry_id uuid; v_is_admin boolean;
begin
  select * into v_sub from time_punch_submissions where id = p_id;
  if v_sub.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select (public.is_super_admin() or exists (
    select 1 from user_profiles up where up.user_id = auth.uid() and up.company_id = v_sub.company_id and up.role = 'contractor_admin'
  )) into v_is_admin;
  if not v_is_admin then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_sub.status not in ('submitted') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  if v_sub.hours is null or v_sub.hours <= 0 then return jsonb_build_object('ok', false, 'error', 'no_hours'); end if;
  insert into time_entries (company_id, crew_member_id, project_id, work_date, hours, notes, logged_by)
  values (v_sub.company_id, v_sub.crew_member_id, v_sub.project_id, v_sub.clock_in_at::date, v_sub.hours, v_sub.description, auth.uid())
  returning id into v_entry_id;
  update time_punch_submissions set status = 'approved', approved_entry_id = v_entry_id where id = p_id;
  return jsonb_build_object('ok', true, 'entry_id', v_entry_id);
end; $$;
grant execute on function public.rivetpay_approve_submission(uuid) to authenticated;
