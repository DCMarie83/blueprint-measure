-- ============================================================
-- RivetDog Academy: modules, videos, curated public Q&A
-- Re-runnable.
-- ============================================================
create or replace function public.academy_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table if not exists public.academy_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academy_modules_sort_idx on public.academy_modules (sort_order);
drop trigger if exists academy_modules_set_updated_at on public.academy_modules;
create trigger academy_modules_set_updated_at before update on public.academy_modules
  for each row execute function public.academy_set_updated_at();
alter table public.academy_modules enable row level security;
drop policy if exists "academy_modules_select_active" on public.academy_modules;
create policy "academy_modules_select_active" on public.academy_modules for select
  to authenticated using (is_active = true);
drop policy if exists "academy_modules_super_admin_all" on public.academy_modules;
create policy "academy_modules_super_admin_all" on public.academy_modules for all
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists public.academy_videos (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references public.academy_modules(id) on delete set null,
  title text not null, description text,
  youtube_id text not null, duration text,
  audience text not null default 'all' check (audience in ('all','admin')),
  trade_vertical text not null default 'all',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academy_videos_module_idx on public.academy_videos (module_id);
create index if not exists academy_videos_active_idx on public.academy_videos (is_active);
create index if not exists academy_videos_sort_idx on public.academy_videos (sort_order);
drop trigger if exists academy_videos_set_updated_at on public.academy_videos;
create trigger academy_videos_set_updated_at before update on public.academy_videos
  for each row execute function public.academy_set_updated_at();
alter table public.academy_videos enable row level security;
drop policy if exists "academy_videos_select_active" on public.academy_videos;
create policy "academy_videos_select_active" on public.academy_videos for select
  to authenticated using (is_active = true);
drop policy if exists "academy_videos_super_admin_all" on public.academy_videos;
create policy "academy_videos_super_admin_all" on public.academy_videos for all
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists public.academy_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  question text not null,
  video_id uuid references public.academy_videos(id) on delete set null,
  answer text, answered_by uuid, answered_at timestamptz,
  is_published boolean not null default false,
  notify_method text not null default 'email' check (notify_method in ('email','in_app')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists academy_questions_company_idx on public.academy_questions (company_id);
create index if not exists academy_questions_user_idx on public.academy_questions (user_id);
create index if not exists academy_questions_published_idx on public.academy_questions (is_published);
create index if not exists academy_questions_video_idx on public.academy_questions (video_id);
create index if not exists academy_questions_unanswered_idx on public.academy_questions (answered_at) where answer is null;
drop trigger if exists academy_questions_set_updated_at on public.academy_questions;
create trigger academy_questions_set_updated_at before update on public.academy_questions
  for each row execute function public.academy_set_updated_at();
alter table public.academy_questions enable row level security;
drop policy if exists "academy_questions_select" on public.academy_questions;
create policy "academy_questions_select" on public.academy_questions for select
  to authenticated using (
    is_published = true
    or company_id in (select company_id from public.user_profiles where user_id = auth.uid())
    or public.is_super_admin()
  );
drop policy if exists "academy_questions_insert" on public.academy_questions;
create policy "academy_questions_insert" on public.academy_questions for insert
  to authenticated with check (
    company_id in (select company_id from public.user_profiles where user_id = auth.uid())
    or public.is_super_admin()
  );
drop policy if exists "academy_questions_update" on public.academy_questions;
create policy "academy_questions_update" on public.academy_questions for update
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "academy_questions_delete" on public.academy_questions;
create policy "academy_questions_delete" on public.academy_questions for delete
  to authenticated using (public.is_super_admin());
