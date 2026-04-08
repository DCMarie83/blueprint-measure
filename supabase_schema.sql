-- ============================================================
-- BlueprintMeasure — Supabase SQL Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- Enable UUID generation (already enabled in Supabase by default, but just in case)
create extension if not exists "pgcrypto";


-- ============================================================
-- TABLE: companies
-- One row per company (e.g. "Central Custom Painting")
-- In this version, companies are created manually.
-- Future: tie to Stripe subscriptions.
-- ============================================================
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);


-- ============================================================
-- TABLE: users (extends Supabase's built-in auth.users)
-- We store extra profile info here.
-- auth.users is managed by Supabase — we reference it by id.
-- ============================================================
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  company_id    uuid references public.companies(id) on delete set null,
  full_name     text,
  email         text not null,
  created_at    timestamptz not null default now()
);


-- ============================================================
-- TABLE: sessions
-- One row per blueprint upload / measurement session.
-- Belongs to a user. Has a client name and project name
-- to support future invoice generation.
-- ============================================================
create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  client_name     text not null,
  project_name    text not null,
  blueprint_url   text,          -- URL in Supabase Storage after upload
  blueprint_type  text,          -- MIME type: image/jpeg, image/png, application/pdf
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- ============================================================
-- TABLE: zones
-- One row per labeled measurement zone within a session.
-- measurement_type is 'SF', 'LF', or 'count'.
-- points stores the array of {x, y} canvas coordinates as JSON.
-- result is the calculated value (sq ft, lin ft, or count).
-- unit_cost and labor_rate are HIDDEN placeholders for a future
-- pricing layer — they are NULL in the UI now.
-- ============================================================
create table if not exists public.zones (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions(id) on delete cascade,
  name              text not null,
  measurement_type  text not null check (measurement_type in ('SF', 'LF', 'count')),
  points            jsonb,        -- Array of {x: number, y: number} objects
  result            numeric,      -- Calculated measurement result

  -- ── Future pricing layer (hidden in UI, present in DB) ──
  unit_cost         numeric,      -- Cost per SF/LF/count — NOT shown in UI yet
  labor_rate        numeric,      -- Labor rate per SF/LF/count — NOT shown in UI yet

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);


-- ============================================================
-- INDEXES — speed up common queries
-- ============================================================
create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists zones_session_id_idx on public.zones(session_id);


-- ============================================================
-- AUTO-UPDATE updated_at timestamps
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_updated_at on public.sessions;
create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

drop trigger if exists zones_updated_at on public.zones;
create trigger zones_updated_at
  before update on public.zones
  for each row execute function public.set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- This ensures each user can ONLY see their own data.
-- This is the security layer — without it, any logged-in user
-- could read everyone else's sessions.
-- ============================================================

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.zones enable row level security;

-- Users can read/update their own profile
create policy "Users can view own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

-- Sessions: users can only see and modify their own
create policy "Users can view own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Users can create own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sessions"
  on public.sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);

-- Zones: users can only access zones that belong to their sessions
create policy "Users can view own zones"
  on public.zones for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = zones.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can create zones in own sessions"
  on public.zones for insert
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = zones.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can update own zones"
  on public.zones for update
  using (
    exists (
      select 1 from public.sessions s
      where s.id = zones.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "Users can delete own zones"
  on public.zones for delete
  using (
    exists (
      select 1 from public.sessions s
      where s.id = zones.session_id
        and s.user_id = auth.uid()
    )
  );


-- ============================================================
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- When someone signs up via Supabase auth, automatically
-- create their row in public.users.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
-- STORAGE: Create the "blueprints" bucket
-- Run this separately in the Storage tab, or uncomment below.
-- Storage policies are set in the Supabase dashboard.
-- ============================================================
-- insert into storage.buckets (id, name, public)
-- values ('blueprints', 'blueprints', true)
-- on conflict do nothing;
