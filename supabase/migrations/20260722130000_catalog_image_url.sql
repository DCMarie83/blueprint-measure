-- Applied live in SQL Editor 2026-07-22. Matches prod. Migration ledger is dead. Never run via CLI.

alter table materials_catalog add column if not exists image_url text;
