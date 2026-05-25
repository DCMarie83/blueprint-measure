-- ════════════════════════════════════════════════════════════
-- P3 Phase 3 — COMBINED MIGRATION (3 files in one transaction)
-- Run this ONCE in Supabase SQL Editor
-- If any statement fails, the entire transaction rolls back.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1 of 3: subscription_status_changed_at tracking
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS subscription_status_changed_at timestamptz DEFAULT now();

-- Backfill existing rows
UPDATE public.companies
SET subscription_status_changed_at = COALESCE(created_at, now())
WHERE subscription_status_changed_at IS NULL;

-- Function: auto-set subscription_status_changed_at when status changes
CREATE OR REPLACE FUNCTION public.update_subscription_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.subscription_status IS DISTINCT FROM NEW.subscription_status THEN
    NEW.subscription_status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_subscription_status_changed ON public.companies;
CREATE TRIGGER companies_subscription_status_changed
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_subscription_status_changed_at();

-- ────────────────────────────────────────────────────────────
-- 2 of 3: public.users.company_id sync from user_profiles
-- ────────────────────────────────────────────────────────────

-- One-time backfill
UPDATE public.users u
SET company_id = up.company_id
FROM public.user_profiles up
WHERE u.id = up.user_id
  AND u.company_id IS DISTINCT FROM up.company_id;

-- Function: keep public.users.company_id in sync
CREATE OR REPLACE FUNCTION public.sync_users_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET company_id = NEW.company_id
  WHERE id = NEW.user_id
    AND company_id IS DISTINCT FROM NEW.company_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_sync_company_id ON public.user_profiles;
CREATE TRIGGER user_profiles_sync_company_id
  AFTER INSERT OR UPDATE OF company_id ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_users_company_id();

-- ────────────────────────────────────────────────────────────
-- 3 of 3: Orphan detection function (super admin only)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.detect_user_orphans()
RETURNS TABLE (
  user_id uuid,
  email text,
  issue text,
  has_auth_user boolean,
  has_public_user boolean,
  has_profile boolean,
  profile_company_id uuid,
  public_user_company_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permission check
  IF auth.jwt()->>'email' != 'main@ngautomationhub.com' THEN
    RAISE EXCEPTION 'Access denied: super admin only';
  END IF;

  -- auth.users with no user_profiles row
  RETURN QUERY
  SELECT
    au.id AS user_id,
    au.email::text AS email,
    'missing_profile'::text AS issue,
    true AS has_auth_user,
    EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id) AS has_public_user,
    false AS has_profile,
    NULL::uuid AS profile_company_id,
    (SELECT pu.company_id FROM public.users pu WHERE pu.id = au.id) AS public_user_company_id
  FROM auth.users au
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_profiles up WHERE up.user_id = au.id
  );

  -- auth.users with no public.users row
  RETURN QUERY
  SELECT
    au.id AS user_id,
    au.email::text AS email,
    'missing_public_user'::text AS issue,
    true AS has_auth_user,
    false AS has_public_user,
    EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = au.id) AS has_profile,
    (SELECT up.company_id FROM public.user_profiles up WHERE up.user_id = au.id) AS profile_company_id,
    NULL::uuid AS public_user_company_id
  FROM auth.users au
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users pu WHERE pu.id = au.id
  );

  -- user_profiles with no public.users row
  RETURN QUERY
  SELECT
    up.user_id AS user_id,
    up.email::text AS email,
    'missing_public_user'::text AS issue,
    EXISTS (SELECT 1 FROM auth.users au WHERE au.id = up.user_id) AS has_auth_user,
    false AS has_public_user,
    true AS has_profile,
    up.company_id AS profile_company_id,
    NULL::uuid AS public_user_company_id
  FROM public.user_profiles up
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users pu WHERE pu.id = up.user_id
  );

  -- company_id mismatch between user_profiles and public.users
  RETURN QUERY
  SELECT
    up.user_id AS user_id,
    up.email::text AS email,
    'company_id_mismatch'::text AS issue,
    EXISTS (SELECT 1 FROM auth.users au WHERE au.id = up.user_id) AS has_auth_user,
    true AS has_public_user,
    true AS has_profile,
    up.company_id AS profile_company_id,
    pu.company_id AS public_user_company_id
  FROM public.user_profiles up
  JOIN public.users pu ON pu.id = up.user_id
  WHERE up.company_id IS DISTINCT FROM pu.company_id;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_user_orphans() TO authenticated;

COMMIT;
