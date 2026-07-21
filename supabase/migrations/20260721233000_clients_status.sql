-- Applied live in SQL Editor 2026-07-21. Matches prod. Migration ledger is dead. Never run via CLI.

alter table clients add column if not exists status text not null default 'active' check (status in ('lead','active','past','do_not_contact'));
