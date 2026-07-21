-- Applied live in SQL Editor 2026-07-21. Matches prod. Migration ledger is dead. Never run via CLI.

-- estimate_line_items: provenance of each line's price.
alter table estimate_line_items add column if not exists priced_from text
  check (priced_from is null or priced_from in ('library', 'benchmark', 'manual'));
alter table estimate_line_items add column if not exists benchmark_item_id uuid
  references benchmark_items(id) on delete set null;
create index if not exists estimate_line_items_benchmark_item_idx
  on estimate_line_items (benchmark_item_id) where benchmark_item_id is not null;

-- estimates: Smart Bid metadata + send-time market-position snapshot.
alter table estimates add column if not exists smart_created boolean not null default false;
alter table estimates add column if not exists est_labor_cost numeric
  check (est_labor_cost is null or est_labor_cost >= 0);
alter table estimates add column if not exists bid_position text
  check (bid_position is null or bid_position in ('below', 'within', 'above'));
alter table estimates add column if not exists benchmark_typical_total numeric;
alter table estimates add column if not exists pricing_source_mix jsonb;
alter table estimates add column if not exists position_snapshot_at timestamptz;

-- NOTE: estimate_line_items.pricing_item_id was NOT added today. It pre-existed
-- from a prior session with a live FK to pricing_items (on delete set null) and
-- is populated on 57 of 62 prod rows. It is untouched here.
