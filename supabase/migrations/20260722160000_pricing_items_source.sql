-- Applied live in SQL Editor 2026-07-22. Matches prod. Migration ledger is dead. Never run via CLI.

-- Provenance for library rates: 'user' (the contractor's own), 'seeded' (generic
-- starter examples shipped to non-pilot companies), 'smart_bid' (adopted from
-- regional market data via the Smart Bid wizard). Seeded rows never price a
-- Smart Bid line; editing one flips it to 'user' in the app layer.
alter table pricing_items add column if not exists source text not null default 'user';

alter table pricing_items drop constraint if exists pricing_items_source_check;
alter table pricing_items add constraint pricing_items_source_check
  check (source in ('user', 'seeded', 'smart_bid'));

-- Backfill: stamp the nine generic seed rows as 'seeded' for non-pilot companies.
-- Matched on (name, default_rate) with the tiered rates untouched (better/best null),
-- so a contractor who edited a starter rate is never reclassified.
update pricing_items pi
set source = 'seeded'
from companies c
where pi.company_id = c.id
  and coalesce(c.subscription_status, '') <> 'pilot'
  and pi.default_rate_better is null
  and pi.default_rate_best is null
  and (pi.name, pi.default_rate) in (
    ('Wall paint - 2 coats, mid-grade', 1.50),
    ('Ceiling paint - flat finish', 1.25),
    ('Accent wall - feature color', 2.50),
    ('Trim paint - doors & frames', 85.00),
    ('Primer coat', 0.85),
    ('Surface prep - patch & sand', 0.75),
    ('Caulking - interior joints', 1.50),
    ('Pressure wash', 0.35),
    ('Exterior body - 2 coats', 2.00)
  );
