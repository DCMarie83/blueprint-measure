-- ════════════════════════════════════════════════════════════
-- P3 Fix 2: client_errors.tenant_id → company_id rename
-- 5/13/26
-- ════════════════════════════════════════════════════════════
-- CONTEXT: Every other table uses company_id. client_errors was
-- missed during the P3 rename pass. The frontend (logError.js)
-- already inserts as company_id, so inserts are currently failing
-- silently because the column doesn't exist under that name.
-- ════════════════════════════════════════════════════════════

-- Step 1: Rename the column
ALTER TABLE public.client_errors RENAME COLUMN tenant_id TO company_id;

-- Step 2: Drop the old index that references tenant_id
DROP INDEX IF EXISTS idx_client_errors_tenant_recent;

-- Step 3: Recreate the index with the new column name
CREATE INDEX IF NOT EXISTS idx_client_errors_company_recent
  ON public.client_errors (company_id, created_at DESC);

-- Step 4: Drop + recreate the SELECT policy that references tenant_id
DROP POLICY IF EXISTS "client_errors_select_admin" ON public.client_errors;

CREATE POLICY "client_errors_select_admin"
  ON public.client_errors
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_contractor_admin() AND company_id = public.current_user_company_id())
  );
