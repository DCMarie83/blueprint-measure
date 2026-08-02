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
-- On this project, Supabase's default privileges grant EXECUTE on every
-- NEW function DIRECTLY to anon and authenticated (not only to PUBLIC),
-- and PostgREST exposes the public schema — so a fresh function is
-- anon-callable the instant it is created, until it is explicitly revoked.
-- REVOKE ... FROM PUBLIC alone is NOT enough here: the direct anon and
-- authenticated grants survive it.
--   • Internal function (no anon, no browser): REVOKE EXECUTE ON FUNCTION
--     ... FROM PUBLIC, anon, authenticated. Strip all three.
--   • Deliberate anon function (listed below): do the same revoke, then
--     GRANT EXECUTE ... TO anon (and TO authenticated when signed-in users
--     also call it). The grant is the record of intent.
-- A new function passing A1 by accident is therefore impossible — it is
-- born anon-executable. If a name shows up as UNEXPECTED, the author simply
-- skipped the revoke. Adding a name here is a deliberate decision.
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
    ('request_estimate_changes'),
    ('rivetpay_accept_terms'),
    ('rivetpay_clock_in'),
    ('rivetpay_clock_out'),
    ('rivetpay_get_link'),
    ('rivetpay_submit_manual'),
    ('submit_demo_lead')
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
),

-- ── A8 ─────────────────────────────────────────────────────────────
-- materials_catalog is a PLATFORM catalog: readable by any authenticated
-- user (is_active rows) but written ONLY by super admins. anon must have no
-- access at all, and each of insert/update/delete must gate on is_super_admin.
a8_bad AS (
  -- anon holds any table privilege on materials_catalog
  SELECT 'anon-grant'::text AS problem
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'materials_catalog' AND grantee = 'anon'
  UNION ALL
  -- a write policy that does not gate on is_super_admin
  SELECT (cmd || '-ungated:' || policyname)::text
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'materials_catalog'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
    AND (coalesce(qual, '') || coalesce(with_check, '')) NOT ILIKE '%is_super_admin%'
  UNION ALL
  -- a write command with no policy at all
  SELECT ('missing-' || want.c)::text
  FROM (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS want(c)
  WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = 'materials_catalog' AND p.cmd = want.c)
),
a8 AS (
  SELECT 'A8'::text,
         'materials_catalog: anon has no access; insert/update/delete gate on is_super_admin only'::text,
         CASE WHEN (SELECT count(*) FROM a8_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('PROBLEMS: ' || (SELECT string_agg(problem, ', ' ORDER BY problem) FROM a8_bad),
                  'anon locked out; all three write policies super-admin-gated')::text
),

-- ── A9 ─────────────────────────────────────────────────────────────
-- company_material_prices is tenant data: all four CRUD policies must exist,
-- be granted TO authenticated, and scope to the caller's company OR super admin.
a9_bad AS (
  SELECT ('missing-' || want.c)::text AS problem
  FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) AS want(c)
  WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = 'company_material_prices' AND p.cmd = want.c)
  UNION ALL
  SELECT ('not-authenticated:' || policyname)::text
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'company_material_prices'
    AND NOT ('authenticated' = ANY(roles))
  UNION ALL
  SELECT ('unscoped:' || policyname)::text
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'company_material_prices'
    AND (coalesce(qual, '') || coalesce(with_check, '')) NOT ILIKE '%user_profiles%'
    AND (coalesce(qual, '') || coalesce(with_check, '')) NOT ILIKE '%is_super_admin%'
  UNION ALL
  -- anon holds any table privilege on company_material_prices
  SELECT 'anon-grant'::text
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'company_material_prices' AND grantee = 'anon'
),
a9 AS (
  SELECT 'A9'::text,
         'company_material_prices: anon has no access; 4 policies, TO authenticated, company-scoped or super admin'::text,
         CASE WHEN (SELECT count(*) FROM a9_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('PROBLEMS: ' || (SELECT string_agg(problem, ', ' ORDER BY problem) FROM a9_bad),
                  'all four policies present, authenticated, and scoped')::text
),

-- ── A10 ────────────────────────────────────────────────────────────
-- product_events is an append-only analytics log. Rows are inserted by
-- tenants (checked elsewhere) and read ONLY by super admins; it must carry NO
-- update or delete policy, so events can never be altered or erased.
a10_bad AS (
  SELECT 'select-not-superadmin'::text AS problem
  WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = 'product_events' AND p.cmd = 'SELECT'
                      AND coalesce(p.qual, '') ILIKE '%is_super_admin%')
  UNION ALL
  SELECT ('forbidden-' || cmd || ':' || policyname)::text
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'product_events' AND cmd IN ('UPDATE', 'DELETE')
  UNION ALL
  -- anon holds any table privilege on product_events
  SELECT 'anon-grant'::text
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'product_events' AND grantee = 'anon'
),
a10 AS (
  SELECT 'A10'::text,
         'product_events: anon has no access; select gates on is_super_admin; no update/delete policies exist'::text,
         CASE WHEN (SELECT count(*) FROM a10_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('PROBLEMS: ' || (SELECT string_agg(problem, ', ' ORDER BY problem) FROM a10_bad),
                  'select is super-admin only; no update/delete policies')::text
),

-- ── A11 ────────────────────────────────────────────────────────────
-- The grade rename must be complete on material_order_items: the graded
-- columns + coats exist and the legacy good/better/best columns are gone. A
-- half-applied rename silently breaks every materials cost read.
a11_missing AS (
  SELECT want.c::text AS col
  FROM (VALUES ('product_premium'), ('product_standard'), ('product_commercial'),
               ('cost_premium'), ('cost_standard'), ('cost_commercial'), ('coats')) AS want(c)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'material_order_items' AND column_name = want.c)
),
a11_legacy AS (
  SELECT column_name::text AS col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'material_order_items'
    AND column_name IN ('product_good', 'product_better', 'product_best', 'cost_good', 'cost_better', 'cost_best')
),
a11 AS (
  SELECT 'A11'::text,
         'material_order_items: graded columns + coats exist; legacy good/better/best gone'::text,
         CASE WHEN (SELECT count(*) FROM a11_missing) = 0 AND (SELECT count(*) FROM a11_legacy) = 0
              THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce(
           nullif(concat_ws(' | ',
             'MISSING: ' || (SELECT string_agg(col, ', ' ORDER BY col) FROM a11_missing),
             'LEGACY STILL PRESENT: ' || (SELECT string_agg(col, ', ' ORDER BY col) FROM a11_legacy)
           ), ''),
           'all graded columns + coats present, no legacy columns'
         )::text
),

-- ── A12 ────────────────────────────────────────────────────────────
-- Stage 2 provenance: each material line records which catalog row (per
-- grade) it resolved from. All three columns must exist, else the resolution
-- layer's writes silently drop and My-Price attribution breaks.
a12_missing AS (
  SELECT want.c::text AS col
  FROM (VALUES ('catalog_item_premium_id'), ('catalog_item_standard_id'), ('catalog_item_commercial_id')) AS want(c)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'material_order_items' AND column_name = want.c)
),
a12 AS (
  SELECT 'A12'::text,
         'material_order_items carries the three catalog_item_*_id provenance columns'::text,
         CASE WHEN (SELECT count(*) FROM a12_missing) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('MISSING: ' || (SELECT string_agg(col, ', ' ORDER BY col) FROM a12_missing),
                  'all three provenance columns present')::text
),

-- ── A13 ────────────────────────────────────────────────────────────
-- Gridiron benchmark tables: anon has zero grants, every FOR ALL (write)
-- policy gates on is_super_admin, and RLS is enabled on all five.
a13_tables(tbl) AS (
  VALUES ('benchmark_sources'), ('benchmark_taxonomy'), ('benchmark_items'),
         ('benchmark_regions'), ('benchmark_region_multipliers')
),
a13_bad AS (
  -- anon holds any table privilege on a benchmark table
  SELECT ('anon-grant:' || g.table_name)::text AS problem
  FROM information_schema.role_table_grants g
  WHERE g.table_schema = 'public'
    AND g.table_name IN (SELECT tbl FROM a13_tables)
    AND g.grantee = 'anon'
  UNION ALL
  -- a FOR ALL (write) policy that does not gate on is_super_admin
  SELECT ('write-ungated:' || tablename || '.' || policyname)::text
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (SELECT tbl FROM a13_tables)
    AND cmd = 'ALL'
    AND (coalesce(qual, '') || coalesce(with_check, '')) NOT ILIKE '%is_super_admin%'
  UNION ALL
  -- RLS not enabled on a benchmark table
  SELECT ('rls-off:' || c.relname)::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN (SELECT tbl FROM a13_tables)
    AND c.relrowsecurity = false
),
a13 AS (
  SELECT 'A13'::text,
         'benchmark tables: anon has zero grants; FOR ALL policies gate is_super_admin; RLS enabled on all five'::text,
         CASE WHEN (SELECT count(*) FROM a13_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('PROBLEMS: ' || (SELECT string_agg(problem, ', ' ORDER BY problem) FROM a13_bad),
                  'anon locked out; all write policies super-admin-gated; RLS on')::text
),

-- ── A14 ────────────────────────────────────────────────────────────
-- Smart Bid foundation columns: estimate_line_items carries priced_from +
-- benchmark_item_id; estimates carries the six Smart Bid / snapshot columns.
-- A missing column silently drops provenance or the send-time snapshot.
a14_missing AS (
  SELECT (want.tbl || '.' || want.col)::text AS col
  FROM (VALUES
    ('estimate_line_items', 'priced_from'),
    ('estimate_line_items', 'benchmark_item_id'),
    ('estimates', 'smart_created'),
    ('estimates', 'est_labor_cost'),
    ('estimates', 'bid_position'),
    ('estimates', 'benchmark_typical_total'),
    ('estimates', 'pricing_source_mix'),
    ('estimates', 'position_snapshot_at')
  ) AS want(tbl, col)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = want.tbl AND column_name = want.col)
),
a14 AS (
  SELECT 'A14'::text,
         'Smart Bid columns exist on estimate_line_items (priced_from, benchmark_item_id) and estimates (smart_created + 5 snapshot cols)'::text,
         CASE WHEN (SELECT count(*) FROM a14_missing) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('MISSING: ' || (SELECT string_agg(col, ', ' ORDER BY col) FROM a14_missing),
                  'all Smart Bid columns present')::text
),

-- ── A15 ────────────────────────────────────────────────────────────
-- CRM: clients.status must exist and carry the lead/active/past/do_not_contact
-- check, or the Clients v2 status chips/filters read a column that isn't there.
a15_bad AS (
  SELECT 'missing-column'::text AS problem
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'status')
  UNION ALL
  SELECT 'missing-check'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'clients'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%do_not_contact%')
),
a15 AS (
  SELECT 'A15'::text,
         'clients carries status with the lead/active/past/do_not_contact check'::text,
         CASE WHEN (SELECT count(*) FROM a15_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('PROBLEMS: ' || (SELECT string_agg(problem, ', ') FROM a15_bad),
                  'status column and check present')::text
),

-- ── A16 ────────────────────────────────────────────────────────────
-- lifetime_value writer: cash-collected recompute is installed, pinned, and
-- bound to both the payments ledger and the invoice aggregate path; the
-- legacy accepted-estimate writer stays dead.
a16_bad AS (
  SELECT 'missing-trigger:invoice_payments'::text AS problem
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.triggers
                    WHERE trigger_schema = 'public'
                      AND event_object_table = 'invoice_payments'
                      AND trigger_name = 'trg_ltv_invoice_payments')
  UNION ALL
  SELECT 'missing-trigger:invoices'
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.triggers
                    WHERE trigger_schema = 'public'
                      AND event_object_table = 'invoices'
                      AND trigger_name = 'trg_ltv_invoices')
  UNION ALL
  SELECT 'missing-or-unpinned:recompute_client_lifetime_value'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'recompute_client_lifetime_value'
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
                  WHERE cfg LIKE 'search_path=%'))
  UNION ALL
  SELECT 'legacy-writer-still-present'
  WHERE EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'recalculate_client_lifetime_value')
),
a16 AS (
  SELECT 'A16'::text,
         'lifetime_value: pinned cash recompute bound to invoice_payments and invoices; legacy writer gone'::text,
         CASE WHEN (SELECT count(*) FROM a16_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('PROBLEMS: ' || (SELECT string_agg(problem, ', ' ORDER BY problem) FROM a16_bad),
                  'cash writer installed and pinned; legacy writer dead')::text
),

-- ── A17 ────────────────────────────────────────────────────────────
-- Portal request-changes: the status vocabulary includes changes_requested,
-- the comment fields exist, and the anon RPC is present and pinned. A1 holds
-- the anon grant; A4 holds the pin globally; this pins the feature's shape.
a17_bad AS (
  SELECT 'status-check-missing-changes_requested'::text AS problem
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'estimates'::regclass AND conname = 'estimates_status_check'
      AND pg_get_constraintdef(oid) ILIKE '%changes_requested%')
  UNION ALL
  SELECT ('missing-column:' || want.c)::text
  FROM (VALUES ('change_request_comment'), ('changes_requested_at')) AS want(c)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = want.c)
  UNION ALL
  SELECT 'rpc-missing-or-unpinned'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'request_estimate_changes'
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cfg
                  WHERE cfg LIKE 'search_path=%'))
),
a17 AS (
  SELECT 'A17'::text,
         'estimates: changes_requested in status check; comment fields present; anon RPC installed and pinned'::text,
         CASE WHEN (SELECT count(*) FROM a17_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('PROBLEMS: ' || (SELECT string_agg(problem, ', ' ORDER BY problem) FROM a17_bad),
                  'request-changes shape complete')::text
),

-- ── A18 ────────────────────────────────────────────────────────────
-- pricing_items provenance: the source column and its three-value check must
-- exist, or the Smart Bid seeded-exclusion and the library "Starter rate" chip
-- key off a column/constraint that isn't there.
a18_bad AS (
  SELECT 'missing-column:source'::text AS problem
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pricing_items' AND column_name = 'source')
  UNION ALL
  SELECT 'missing-or-incomplete-check:pricing_items_source_check'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'pricing_items'::regclass AND conname = 'pricing_items_source_check'
      AND pg_get_constraintdef(oid) ILIKE '%user%'
      AND pg_get_constraintdef(oid) ILIKE '%seeded%'
      AND pg_get_constraintdef(oid) ILIKE '%smart_bid%')
),
a18 AS (
  SELECT 'A18'::text,
         'pricing_items: source column with user/seeded/smart_bid check present'::text,
         CASE WHEN (SELECT count(*) FROM a18_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('PROBLEMS: ' || (SELECT string_agg(problem, ', ' ORDER BY problem) FROM a18_bad),
                  'source column and check present')::text
),

-- ── A19 ────────────────────────────────────────────────────────────
-- /try demo lead capture: submit_demo_lead is the anon RPC that writes a
-- lead row, and the newest member of the deliberate anon set (A1 holds the
-- full membership). This pins its grant shape: anon may EXECUTE, PUBLIC may
-- not — the explicit grant, not a blanket PUBLIC default, is the intent.
a19_bad AS (
  SELECT 'anon-missing-execute'::text AS problem
  WHERE NOT has_function_privilege('anon',
    'public.submit_demo_lead(text,text,text,text,text,text,text,text,text)'::regprocedure, 'EXECUTE')
  UNION ALL
  SELECT 'public-has-execute'
  WHERE EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = 'submit_demo_lead'
      AND grantee = 'PUBLIC' AND privilege_type = 'EXECUTE')
),
a19 AS (
  SELECT 'A19'::text,
         'submit_demo_lead: anon has EXECUTE, PUBLIC does not (deliberate anon RPC)'::text,
         CASE WHEN (SELECT count(*) FROM a19_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('PROBLEMS: ' || (SELECT string_agg(problem, ', ' ORDER BY problem) FROM a19_bad),
                  'anon granted execute; PUBLIC has none')::text
),

-- ── A20 ────────────────────────────────────────────────────────────
-- demo_leads holds lead emails (PII). No client role touches it directly:
-- all access goes through the submit_demo_lead SECURITY DEFINER RPC (A19).
-- anon and authenticated get no SELECT, and anon gets no INSERT, so a
-- captured email can never be read back or written around the RPC.
a20_bad AS (
  SELECT 'anon-select'::text AS problem
  WHERE has_table_privilege('anon', 'public.demo_leads', 'SELECT')
  UNION ALL
  SELECT 'authenticated-select'
  WHERE has_table_privilege('authenticated', 'public.demo_leads', 'SELECT')
  UNION ALL
  SELECT 'anon-insert'
  WHERE has_table_privilege('anon', 'public.demo_leads', 'INSERT')
),
a20 AS (
  SELECT 'A20'::text,
         'demo_leads (lead PII): anon/authenticated cannot SELECT; anon cannot INSERT (RPC-only access)'::text,
         CASE WHEN (SELECT count(*) FROM a20_bad) = 0 THEN 'PASS' ELSE 'FAIL' END::text,
         coalesce('LEAKS: ' || (SELECT string_agg(problem, ', ' ORDER BY problem) FROM a20_bad),
                  'no direct client access; RPC-only')::text
)

SELECT * FROM a1
UNION ALL SELECT * FROM a2
UNION ALL SELECT * FROM a3
UNION ALL SELECT * FROM a4
UNION ALL SELECT * FROM a5
UNION ALL SELECT * FROM a6
UNION ALL SELECT * FROM a7
UNION ALL SELECT * FROM a8
UNION ALL SELECT * FROM a9
UNION ALL SELECT * FROM a10
UNION ALL SELECT * FROM a11
UNION ALL SELECT * FROM a12
UNION ALL SELECT * FROM a13
UNION ALL SELECT * FROM a14
UNION ALL SELECT * FROM a15
UNION ALL SELECT * FROM a16
UNION ALL SELECT * FROM a17
UNION ALL SELECT * FROM a18
UNION ALL SELECT * FROM a19
UNION ALL SELECT * FROM a20
ORDER BY id;
