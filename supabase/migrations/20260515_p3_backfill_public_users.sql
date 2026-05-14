-- ════════════════════════════════════════════════════════════
-- P3 Fix: backfill public.users from auth.users
-- 5/15/26 — Applied via SQL Editor (this file documents what was run)
-- ════════════════════════════════════════════════════════════
-- One-time backfill: any auth.users rows that existed before the
-- trigger fix (above) had no corresponding public.users row.
-- This inserts the missing rows so existing users can create
-- projects without FK violations.
-- ════════════════════════════════════════════════════════════

INSERT INTO public.users (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;
