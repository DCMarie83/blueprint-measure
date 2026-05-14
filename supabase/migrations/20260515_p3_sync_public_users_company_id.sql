-- ════════════════════════════════════════════════════════════
-- P3 Fix: sync company_id on public.users from user_profiles
-- 5/15/26 — Applied via SQL Editor (this file documents what was run)
-- ════════════════════════════════════════════════════════════
-- One-time sync: public.users rows created by the backfill (or by
-- the partial/broken trigger era) had NULL company_id. This pulls
-- the correct company_id from user_profiles for each user.
-- ════════════════════════════════════════════════════════════

UPDATE public.users u
SET company_id = up.company_id
FROM public.user_profiles up
WHERE u.id = up.user_id
  AND u.company_id IS NULL
  AND up.company_id IS NOT NULL;
