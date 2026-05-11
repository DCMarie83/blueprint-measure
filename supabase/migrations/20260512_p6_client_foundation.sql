-- =============================================================================
-- P6 Client Foundation (5/12/26)
-- - Extend clients table with CRM fields
-- - Create client_contacts sub-table
-- =============================================================================

-- ── Add new columns to clients ───────────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_type text,
  ADD COLUMN IF NOT EXISTS display_name_new text,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS primary_email_new text,
  ADD COLUMN IF NOT EXISTS primary_phone_new text,
  ADD COLUMN IF NOT EXISTS preferred_contact_method text,
  ADD COLUMN IF NOT EXISTS property_address_new jsonb,
  ADD COLUMN IF NOT EXISTS billing_address jsonb,
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS billing_terms text;

-- CHECK constraints
ALTER TABLE clients ADD CONSTRAINT clients_client_type_check
  CHECK (client_type IN ('residential', 'commercial'));
ALTER TABLE clients ADD CONSTRAINT clients_contact_method_check
  CHECK (preferred_contact_method IS NULL OR preferred_contact_method IN ('email', 'phone', 'sms', 'whatsapp'));
ALTER TABLE clients ADD CONSTRAINT clients_billing_terms_check
  CHECK (billing_terms IS NULL OR billing_terms IN ('due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60', 'custom'));

-- Backfill existing data
UPDATE clients SET
  client_type = 'residential',
  display_name_new = COALESCE(name, 'Unnamed Client'),
  primary_email_new = email,
  primary_phone_new = phone,
  property_address_new = address
WHERE client_type IS NULL;

-- Enforce NOT NULL on required columns
ALTER TABLE clients ALTER COLUMN client_type SET NOT NULL;
ALTER TABLE clients ALTER COLUMN display_name_new SET NOT NULL;

-- Drop old columns
ALTER TABLE clients DROP COLUMN IF EXISTS name;
ALTER TABLE clients DROP COLUMN IF EXISTS email;
ALTER TABLE clients DROP COLUMN IF EXISTS phone;
ALTER TABLE clients DROP COLUMN IF EXISTS address;

-- Rename _new columns to final names
ALTER TABLE clients RENAME COLUMN display_name_new TO display_name;
ALTER TABLE clients RENAME COLUMN primary_email_new TO primary_email;
ALTER TABLE clients RENAME COLUMN primary_phone_new TO primary_phone;
ALTER TABLE clients RENAME COLUMN property_address_new TO property_address;

-- Indexes
CREATE INDEX IF NOT EXISTS clients_display_name_idx ON clients(company_id, display_name);
CREATE INDEX IF NOT EXISTS clients_client_type_idx ON clients(company_id, client_type);

-- ── client_contacts sub-table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  is_primary boolean DEFAULT false NOT NULL,
  is_portal_recipient boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamptz DEFAULT NOW() NOT NULL,
  updated_at timestamptz DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS client_contacts_client_id_idx ON client_contacts(client_id);

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_contacts_select ON client_contacts FOR SELECT USING (
  auth.jwt()->>'email' = 'main@ngautomationhub.com'
  OR client_id IN (
    SELECT id FROM clients WHERE company_id IN (
      SELECT company_id FROM user_profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY client_contacts_insert ON client_contacts FOR INSERT WITH CHECK (
  auth.jwt()->>'email' = 'main@ngautomationhub.com'
  OR client_id IN (
    SELECT id FROM clients WHERE company_id IN (
      SELECT company_id FROM user_profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY client_contacts_update ON client_contacts FOR UPDATE USING (
  auth.jwt()->>'email' = 'main@ngautomationhub.com'
  OR client_id IN (
    SELECT id FROM clients WHERE company_id IN (
      SELECT company_id FROM user_profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY client_contacts_delete ON client_contacts FOR DELETE USING (
  auth.jwt()->>'email' = 'main@ngautomationhub.com'
  OR client_id IN (
    SELECT id FROM clients WHERE company_id IN (
      SELECT company_id FROM user_profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE OR REPLACE FUNCTION update_client_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_contacts_updated_at_trigger ON client_contacts;
CREATE TRIGGER client_contacts_updated_at_trigger
BEFORE UPDATE ON client_contacts
FOR EACH ROW
EXECUTE FUNCTION update_client_contacts_updated_at();
