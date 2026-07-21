-- Applied live in SQL Editor 2026-07-21. Matches prod. Migration ledger is dead. Never run via CLI.

revoke all privileges on table materials_catalog from anon;
revoke all privileges on table company_material_prices from anon;
revoke all privileges on table product_events from anon;
