CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS impersonation_sessions_admin_idx ON public.impersonation_sessions USING btree (admin_user_id);
CREATE INDEX IF NOT EXISTS impersonation_sessions_company_idx ON public.impersonation_sessions USING btree (target_company_id);
CREATE INDEX IF NOT EXISTS impersonation_sessions_started_idx ON public.impersonation_sessions USING btree (started_at DESC);
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS impersonation_sessions_super_select ON public.impersonation_sessions;
CREATE POLICY impersonation_sessions_super_select ON public.impersonation_sessions
  FOR SELECT USING (public.is_super_admin());
DROP POLICY IF EXISTS impersonation_sessions_super_insert ON public.impersonation_sessions;
CREATE POLICY impersonation_sessions_super_insert ON public.impersonation_sessions
  FOR INSERT WITH CHECK (public.is_super_admin() AND admin_user_id = auth.uid());
DROP POLICY IF EXISTS impersonation_sessions_super_update ON public.impersonation_sessions;
CREATE POLICY impersonation_sessions_super_update ON public.impersonation_sessions
  FOR UPDATE USING (public.is_super_admin());
