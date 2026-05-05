-- P3.5 Error Infrastructure Migration
-- Adds severity, breadcrumbs, resolution tracking, fingerprint columns to client_errors
-- Creates throttle table for critical alert dedupe

-- Drop duplicate INSERT policy (keep "Anyone inserts client_errors")
drop policy if exists "Anyone can insert client errors" on public.client_errors;

-- Add severity with constraint
alter table public.client_errors
  add column if not exists severity text not null default 'error'
    check (severity in ('info', 'warning', 'error', 'critical'));

-- Breadcrumbs jsonb
alter table public.client_errors
  add column if not exists breadcrumbs jsonb default '[]'::jsonb;

-- Resolution tracking
alter table public.client_errors
  add column if not exists resolved boolean not null default false;
alter table public.client_errors
  add column if not exists resolved_at timestamptz;
alter table public.client_errors
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

-- Fingerprint for throttling and grouping
alter table public.client_errors
  add column if not exists error_fingerprint text;

-- Indexes
create index if not exists idx_client_errors_unresolved_critical
  on public.client_errors (created_at desc)
  where resolved = false and severity = 'critical';
create index if not exists idx_client_errors_tenant_recent
  on public.client_errors (tenant_id, created_at desc);
create index if not exists idx_client_errors_fingerprint_recent
  on public.client_errors (error_fingerprint, created_at desc);

-- UPDATE policy for super admin
create policy "Super admin updates client_errors"
  on public.client_errors
  for update
  to authenticated
  using (auth.jwt()->>'email' = 'main@ngautomationhub.com')
  with check (auth.jwt()->>'email' = 'main@ngautomationhub.com');

-- Throttle table for critical alert dedupe
create table if not exists public.error_alert_throttle (
  fingerprint text primary key,
  last_alerted_at timestamptz not null default now()
);
alter table public.error_alert_throttle enable row level security;
