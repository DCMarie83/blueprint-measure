-- Reconcile: companies.trade_vertical hardened to match Model B (6 trades).
-- Applied live in SQL Editor on 2026-07-04; this file keeps the repo in sync.
UPDATE companies SET trade_vertical = 'painting' WHERE trade_vertical IS NULL;
ALTER TABLE companies ALTER COLUMN trade_vertical SET DEFAULT 'painting';
ALTER TABLE companies ALTER COLUMN trade_vertical SET NOT NULL;
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_trade_vertical_check;
ALTER TABLE companies ADD CONSTRAINT companies_trade_vertical_check
  CHECK (trade_vertical IN ('painting','flooring','carpentry','roofing','landscaping','electrical'));
