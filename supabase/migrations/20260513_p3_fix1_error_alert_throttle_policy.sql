-- ════════════════════════════════════════════════════════════
-- P3 Fix 1: error_alert_throttle — add explicit RLS policy
-- 5/13/26
-- ════════════════════════════════════════════════════════════
-- CONTEXT: Table has RLS enabled but 0 policies, meaning no one
-- can read or write — including the service role when using
-- the JS client with RLS enforcement. In practice the Edge
-- Function (notify-critical-error) uses the service_role key
-- which bypasses RLS, so it works today. But the 0-policy state
-- is a maintenance hazard and shows as a red flag in audits.
--
-- FIX: Add an explicit deny-all policy for authenticated users.
-- Service-role access (Edge Functions) is unaffected — it always
-- bypasses RLS. No frontend code touches this table.
-- ════════════════════════════════════════════════════════════

-- Explicit policy: authenticated users cannot read throttle state.
-- This is intentional — only the service role (Edge Functions) accesses this table.
CREATE POLICY "Service role only — deny authenticated"
  ON public.error_alert_throttle
  FOR ALL
  TO authenticated
  USING (false);
