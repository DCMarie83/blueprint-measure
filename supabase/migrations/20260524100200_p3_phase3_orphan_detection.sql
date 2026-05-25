-- ════════════════════════════════════════════════════════════
-- P3 Phase 3: Orphan detection function (super admin only)
-- ════════════════════════════════════════════════════════════

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
