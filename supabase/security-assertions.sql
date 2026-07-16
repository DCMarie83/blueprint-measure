-- ════════════════════════════════════════════════════════════════════
-- RIVETDOG — SECURITY ASSERTIONS
--
-- Run in the Supabase SQL Editor after ANY schema / policy / function /
-- view change, and before any DB-touching push. EVERY row must read PASS.
--
-- WHY THIS FILE EXISTS: portal_view was hardened in May, deliberately
-- reverted three days later, and was still leaking every tenant's
-- portal_token in July. The linter reported it as the only ERROR the whole
-- time, unread. Changelogs preserve WHY. Only assertions detect WHEN it
-- breaks. Memory is not a control.
--
-- ONE STATEMENT ON PURPOSE: the SQL Editor shows only the last result, so
-- every assertion is a CTE and the final UNION ALL is the report.
-- ════════════════════════════════════════════════════════════════════

WITH

-- ── A1 ─────────────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default and PostgREST exposes the
-- public schema, so EVERY function is anon-callable unless revoked.
-- REVOKE FROM anon is a NO-OP (anon is a PUBLIC member) — revoke FROM
-- PUBLIC, then GRANT back to authenticated if real users need it.
-- Adding a name here is a deliberate decision, not a formality.
expected_anon_fns(fn) AS (
  VALUES
    ('accept_estimate'),
    ('decline_estimate'),
    ('gc_respond_to_invoice'),
    ('get_founder_spots'),
    ('get_lite_offer'),
    ('get_portal_estimate'),
    ('get_portal_invoice'),
    ('get_portal_project'),
    ('rivetpay_accept_terms'),
    ('rivetpay_clock_in'),
    ('rivetpay_clock_out'),
    ('rivetpay_get_link'),
    ('rivetpay_submit_manual')
),
actual_anon_fns AS (
  SELECT DISTINCT p.proname::text AS fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.prorettype <> 'trigger'::regtype
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
),
a1_extra   AS (SELECT fn FROM actual_anon_fns EXCEPT SELECT fn FROM expected_anon_fns),
a1_missing AS (SELECT fn FROM expected_anon_fns EXCEPT SELECT fn FROM actual_anon_fns),
a1 AS (
  SELECT 'A1'::text AS id,
         'anon-executable functions are exactly the deliberate set'::text AS assertion,
         CASE WHEN (SELECT count(*) FROM a1_extra) = 0
               AND (SELECT count(*) FROM a1_missing) = 0
              THEN 'PASS' ELSE 'FAIL' END::text AS status,
         coalesce(
           nullif(concat_ws(' | ',
             'UNEXPECTED: ' || (SELECT string_agg(fn, ', ' ORDER BY fn) FROM a1_extra),
             'MISSING: '    || (SELECT string_agg(fn, ', ' ORDER BY fn) FROM a1_missing)
           ), ''),
           (SELECT count(*)::text FROM expected_anon_fns) || ' functions, exactly as intended'
         )::text AS detail
),

-- ── A2 ─────────────────────────────────────────────────────────────
-- company_id is the tenant boundary. A table carrying it with RLS off is
-- a cross-tenant read waiting to be found.
a2_off AS (
  SELECT c.relname::text AS tbl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
    AND EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attname = 'company_id'
                  AND a.attnum > 0 AND NOT a.attisdropped)
),
a2_on AS (
  SELECT c.relname::text AS tbl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
    AND EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attname = 'company_id'
                  AND a.attnum > 0 AND NOT a.attisdropped)
),
a2 AS (
  SELECT 'A2'::text,
         'RLS is enabled on every table carrying company_id'::text,
         CASE WHEN (SELECT count(*) FROM a2_off) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce(
           'RLS OFF: ' || (SELECT string_agg(tbl, ', ' ORDER BY tbl) FROM a2_off),
           (SELECT count(*)::text FROM a2_on) || ' tenant tables, all protected'
         )::text
),

-- ── A3 ─────────────────────────────────────────────────────────────
-- RLS on with zero policies denies everything. Usually means a policy was
-- dropped and never replaced.
expected_deny_all(tbl) AS (
  VALUES ('error_alert_throttle')
),
a3_bare AS (
  SELECT c.relname::text AS tbl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    AND c.relname NOT IN (SELECT tbl FROM expected_deny_all)
),
a3 AS (
  SELECT 'A3'::text,
         'no RLS-enabled table is left with zero policies'::text,
         CASE WHEN (SELECT count(*) FROM a3_bare) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('NO POLICIES: ' || (SELECT string_agg(tbl, ', ' ORDER BY tbl) FROM a3_bare),
                  'every RLS-enabled table has at least one policy')::text
),

-- ── A4 ─────────────────────────────────────────────────────────────
-- A SECURITY DEFINER function without a pinned search_path can be
-- hijacked by a caller-controlled schema. Known outstanding work item.
a4_unpinned AS (
  SELECT p.proname::text AS fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef = true
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
                    WHERE cfg LIKE 'search_path=%')
),
a4 AS (
  SELECT 'A4'::text,
         'every SECURITY DEFINER function pins search_path'::text,
         CASE WHEN (SELECT count(*) FROM a4_unpinned) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce((SELECT count(*)::text FROM a4_unpinned) || ' UNPINNED: ' ||
                  (SELECT string_agg(fn, ', ' ORDER BY fn) FROM a4_unpinned),
                  'all pinned')::text
),

-- ── A5 ─────────────────────────────────────────────────────────────
-- [VIEWS CANNOT AUTHENTICATE] A view takes no parameters, so any token
-- filter is client-side and optional. Token-authed data goes through a
-- SECURITY DEFINER FUNCTION taking the token as an argument. This is the
-- portal_view breach, encoded.
a5_anon_views AS (
  SELECT DISTINCT g.table_name::text AS v
  FROM information_schema.role_table_grants g
  JOIN pg_class c ON c.relname = g.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = g.table_schema
  WHERE g.table_schema = 'public'
    AND c.relkind IN ('v', 'm')
    AND g.grantee IN ('anon', 'PUBLIC')
    AND g.privilege_type = 'SELECT'
),
a5 AS (
  SELECT 'A5'::text,
         'no view is readable by anon (views cannot authenticate)'::text,
         CASE WHEN (SELECT count(*) FROM a5_anon_views) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('ANON-READABLE VIEWS: ' || (SELECT string_agg(v, ', ' ORDER BY v) FROM a5_anon_views),
                  'no view exposed to anon')::text
),

-- ── A6 ─────────────────────────────────────────────────────────────
-- RLS always uses auth.jwt()->>'email'. NEVER a subquery into auth.users:
-- it is slow, it re-enters a protected schema, and it broke before.
a6_bad AS (
  SELECT (tablename || '.' || policyname)::text AS pol
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual, '') ILIKE '%auth.users%'
      OR coalesce(with_check, '') ILIKE '%auth.users%')
),
a6 AS (
  SELECT 'A6'::text,
         'no RLS policy reaches into auth.users (use auth.jwt())'::text,
         CASE WHEN (SELECT count(*) FROM a6_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('auth.users IN POLICY: ' || (SELECT string_agg(pol, ', ' ORDER BY pol) FROM a6_bad),
                  'all policies use the jwt pattern')::text
),

-- ── A7 ─────────────────────────────────────────────────────────────
-- A view without security_invoker runs as its OWNER and bypasses the
-- caller's RLS. CREATE OR REPLACE VIEW RESETS view options, so this
-- silently reverts every time someone edits a view and forgets the WITH.
a7_definer_views AS (
  SELECT DISTINCT c.relname::text AS v
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                WHERE g.table_schema = 'public' AND g.table_name = c.relname
                  AND g.grantee IN ('anon', 'authenticated', 'PUBLIC'))
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions, '{}')) o
                    WHERE o ILIKE 'security_invoker=t%' OR o ILIKE 'security_invoker=on')
),
a7 AS (
  SELECT 'A7'::text,
         'every granted view declares security_invoker (or RLS is bypassed)'::text,
         CASE WHEN (SELECT count(*) FROM a7_definer_views) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('DEFINER VIEWS GRANTED: ' || (SELECT string_agg(v, ', ' ORDER BY v) FROM a7_definer_views),
                  'no granted view runs as owner')::text
)

SELECT * FROM a1
UNION ALL SELECT * FROM a2
UNION ALL SELECT * FROM a3
UNION ALL SELECT * FROM a4
UNION ALL SELECT * FROM a5
UNION ALL SELECT * FROM a6
UNION ALL SELECT * FROM a7
ORDER BY id;
