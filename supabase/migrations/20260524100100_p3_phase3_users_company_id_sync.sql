-- ════════════════════════════════════════════════════════════
-- P3 Phase 3: Sync public.users.company_id from user_profiles
-- One-time backfill + ongoing trigger
-- ════════════════════════════════════════════════════════════

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
