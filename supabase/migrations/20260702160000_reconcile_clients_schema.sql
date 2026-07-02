-- 20260702160000_reconcile_clients_schema.sql
-- Repo-integrity reconcile (audit S3 + S6): captures objects that exist in the
-- live prod DB but had no migration file. Idempotent — safe no-op on prod and
-- required for a clean fresh rebuild (supabase db reset). Prod already contains
-- all of this; this file only catches the repo up.

-- ============================================================
-- 1. clients — un-migrated columns
-- ============================================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS lifetime_value numeric NOT NULL DEFAULT 0;

-- ============================================================
-- 2. client_addresses — full table (no prior migration coverage)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  address_type text NOT NULL CHECK (address_type = ANY (ARRAY['property'::text, 'billing'::text, 'jobsite'::text, 'mailing'::text, 'other'::text])),
  label text,
  street text,
  unit text,
  city text,
  state text,
  zip text,
  country text DEFAULT 'US'::text,
  notes text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_addresses_client_id_idx ON public.client_addresses USING btree (client_id);
CREATE INDEX IF NOT EXISTS client_addresses_company_id_idx ON public.client_addresses USING btree (company_id);

ALTER TABLE public.client_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_addresses_tenant_select ON public.client_addresses;
CREATE POLICY client_addresses_tenant_select ON public.client_addresses
  FOR SELECT USING ((company_id IN ( SELECT user_profiles.company_id FROM public.user_profiles WHERE (user_profiles.user_id = auth.uid()))) OR public.is_super_admin());

DROP POLICY IF EXISTS client_addresses_tenant_insert ON public.client_addresses;
CREATE POLICY client_addresses_tenant_insert ON public.client_addresses
  FOR INSERT WITH CHECK ((company_id IN ( SELECT user_profiles.company_id FROM public.user_profiles WHERE (user_profiles.user_id = auth.uid()))) OR public.is_super_admin());

DROP POLICY IF EXISTS client_addresses_tenant_update ON public.client_addresses;
CREATE POLICY client_addresses_tenant_update ON public.client_addresses
  FOR UPDATE USING ((company_id IN ( SELECT user_profiles.company_id FROM public.user_profiles WHERE (user_profiles.user_id = auth.uid()))) OR public.is_super_admin());

DROP POLICY IF EXISTS client_addresses_tenant_delete ON public.client_addresses;
CREATE POLICY client_addresses_tenant_delete ON public.client_addresses
  FOR DELETE USING ((company_id IN ( SELECT user_profiles.company_id FROM public.user_profiles WHERE (user_profiles.user_id = auth.uid()))) OR public.is_super_admin());

-- ============================================================
-- 3. client_activity — full table (no prior migration coverage)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (activity_type = ANY (ARRAY['note'::text, 'email'::text, 'call'::text, 'sms'::text, 'meeting'::text, 'estimate_sent'::text, 'estimate_viewed'::text, 'estimate_accepted'::text, 'estimate_declined'::text, 'invoice_created'::text, 'invoice_sent'::text, 'invoice_viewed'::text, 'invoice_paid'::text, 'invoice_voided'::text, 'portal_accessed'::text])),
  title text NOT NULL,
  body text,
  metadata jsonb,
  is_automated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_activity_client_id_created_at_idx ON public.client_activity USING btree (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_activity_company_id_idx ON public.client_activity USING btree (company_id);

ALTER TABLE public.client_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_activity_tenant_select ON public.client_activity;
CREATE POLICY client_activity_tenant_select ON public.client_activity
  FOR SELECT USING ((company_id IN ( SELECT user_profiles.company_id FROM public.user_profiles WHERE (user_profiles.user_id = auth.uid()))) OR public.is_super_admin());

DROP POLICY IF EXISTS client_activity_tenant_insert ON public.client_activity;
CREATE POLICY client_activity_tenant_insert ON public.client_activity
  FOR INSERT WITH CHECK ((company_id IN ( SELECT user_profiles.company_id FROM public.user_profiles WHERE (user_profiles.user_id = auth.uid()))) OR public.is_super_admin());

DROP POLICY IF EXISTS client_activity_tenant_update ON public.client_activity;
CREATE POLICY client_activity_tenant_update ON public.client_activity
  FOR UPDATE USING ((company_id IN ( SELECT user_profiles.company_id FROM public.user_profiles WHERE (user_profiles.user_id = auth.uid()))) OR public.is_super_admin());

DROP POLICY IF EXISTS client_activity_tenant_delete ON public.client_activity;
CREATE POLICY client_activity_tenant_delete ON public.client_activity
  FOR DELETE USING ((company_id IN ( SELECT user_profiles.company_id FROM public.user_profiles WHERE (user_profiles.user_id = auth.uid()))) OR public.is_super_admin());

-- ============================================================
-- 4. update_client_last_contact() — trigger fn (bumps clients.last_contact_at)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_client_last_contact()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
BEGIN
  UPDATE clients
  SET last_contact_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.client_id
    AND (last_contact_at IS NULL OR last_contact_at < NEW.created_at);
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 5. trigger — fires the fn after each client_activity insert
-- ============================================================
DROP TRIGGER IF EXISTS client_activity_update_last_contact ON public.client_activity;
CREATE TRIGGER client_activity_update_last_contact
  AFTER INSERT ON public.client_activity
  FOR EACH ROW EXECUTE FUNCTION public.update_client_last_contact();
