-- Applied live in SQL Editor 2026-07-21. Matches prod. Migration ledger is dead. Never run via CLI.

-- Provenance: which catalog row (per grade) each material line resolved from.
alter table material_order_items add column catalog_item_premium_id uuid null references materials_catalog(id) on delete set null;
alter table material_order_items add column catalog_item_standard_id uuid null references materials_catalog(id) on delete set null;
alter table material_order_items add column catalog_item_commercial_id uuid null references materials_catalog(id) on delete set null;

-- Backfill website_url on the three active stores (fallback shop link).
update stores set website_url = 'https://www.homedepot.com' where name = 'Home Depot';
update stores set website_url = 'https://www.lowes.com' where name = 'Lowe''s';
update stores set website_url = 'https://www.sherwin-williams.com' where name = 'Sherwin-Williams';

-- The 22-row painting starter seed into materials_catalog (9 Sherwin-Williams
-- paint/primer coverage rows across premium/standard/commercial on slugs
-- paint-wall-interior, paint-ceiling-interior, primer-interior; 13 standard-grade
-- sundries at Home Depot and Lowe's under per_area/per_job rules) was inserted
-- live in the SQL Editor the same date. It is admin-managed data thereafter
-- (edited via the Materials Catalog admin section), so the seed rows are NOT
-- duplicated here.
