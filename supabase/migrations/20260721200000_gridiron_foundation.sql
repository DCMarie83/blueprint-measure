-- Applied live in SQL Editor 2026-07-21. Matches prod. Migration ledger is dead. Never run via CLI.

-- ── Benchmark source editions (e.g. published cost-data editions) ──────────────
create table benchmark_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  edition_label text,
  edition_year integer,
  notes text,
  created_at timestamptz default now()
);

-- ── Scope taxonomy (self-referencing tree of work scopes) ──────────────────────
create table benchmark_taxonomy (
  id uuid primary key default gen_random_uuid(),
  trade_vertical text not null default 'painting',
  scope_domain text not null check (scope_domain in ('surface_prep', 'application', 'specialty', 'repair')),
  parent_id uuid references benchmark_taxonomy(id) on delete set null,
  slug text not null unique,
  name text not null,
  unit text check (unit in ('sf', 'lf', 'each')),
  csi_code text,
  display_order integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- ── Benchmark line items (bare + O&P typical costs per scope) ───────────────────
create table benchmark_items (
  id uuid primary key default gen_random_uuid(),
  taxonomy_id uuid not null references benchmark_taxonomy(id) on delete cascade,
  source_id uuid not null references benchmark_sources(id) on delete restrict,
  work_type text not null,
  surface text,
  coat_count integer,
  finish text,
  unit text not null check (unit in ('sf', 'lf', 'each')),
  material_typical numeric,
  labor_typical numeric,
  equipment_typical numeric,
  total_typical_with_op numeric not null check (total_typical_with_op >= 0),
  crew_code text,
  daily_output numeric,
  labor_hours numeric,
  notes text,
  active boolean default true,
  display_order integer default 0,
  created_at timestamptz default now()
);
create index benchmark_items_taxonomy_idx on benchmark_items (taxonomy_id);
create index benchmark_items_source_idx on benchmark_items (source_id);

-- ── Regions (national / state / metro hierarchy) ───────────────────────────────
create table benchmark_regions (
  id uuid primary key default gen_random_uuid(),
  region_type text check (region_type in ('national', 'state', 'metro')),
  code text not null unique,
  display_name text not null,
  parent_region_id uuid references benchmark_regions(id) on delete set null,
  created_at timestamptz default now()
);

-- ── Regional cost multipliers (material + labor, per source, per year) ──────────
create table benchmark_region_multipliers (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references benchmark_regions(id) on delete cascade,
  source_id uuid not null references benchmark_sources(id) on delete restrict,
  material_multiplier numeric(5,3) not null,
  labor_multiplier numeric(5,3) not null,
  effective_year integer not null,
  created_at timestamptz default now(),
  unique (region_id, source_id, effective_year)
);

-- ── RLS: authenticated may read, only super admins may write ────────────────────
alter table benchmark_sources enable row level security;
alter table benchmark_taxonomy enable row level security;
alter table benchmark_items enable row level security;
alter table benchmark_regions enable row level security;
alter table benchmark_region_multipliers enable row level security;

create policy benchmark_sources_select on benchmark_sources for select to authenticated using (true);
create policy benchmark_sources_admin_all on benchmark_sources for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy benchmark_taxonomy_select on benchmark_taxonomy for select to authenticated using (true);
create policy benchmark_taxonomy_admin_all on benchmark_taxonomy for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy benchmark_items_select on benchmark_items for select to authenticated using (true);
create policy benchmark_items_admin_all on benchmark_items for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy benchmark_regions_select on benchmark_regions for select to authenticated using (true);
create policy benchmark_regions_admin_all on benchmark_regions for all to authenticated using (is_super_admin()) with check (is_super_admin());

create policy benchmark_region_multipliers_select on benchmark_region_multipliers for select to authenticated using (true);
create policy benchmark_region_multipliers_admin_all on benchmark_region_multipliers for all to authenticated using (is_super_admin()) with check (is_super_admin());

-- ── Anon fully revoked on all five ─────────────────────────────────────────────
revoke all privileges on table benchmark_sources from anon;
revoke all privileges on table benchmark_taxonomy from anon;
revoke all privileges on table benchmark_items from anon;
revoke all privileges on table benchmark_regions from anon;
revoke all privileges on table benchmark_region_multipliers from anon;

-- ── Regionalized low/typical/high per item per region ──────────────────────────
-- security_invoker so the caller's RLS on the base tables applies.
-- Local typical redistributes the bare material/labor split by its regional
-- multipliers, then rescales to preserve the item's total-with-O&P ratio. When
-- the bare-cost split is zero (no material+labor breakdown), fall back to
-- total x labor_multiplier. low/high are typical +/- 15%.
create view v_benchmark_regional
with (security_invoker = on)
as
select
  base.*,
  round(base.typical * 0.85, 2) as low,
  round(base.typical * 1.15, 2) as high
from (
  select
    i.id                     as item_id,
    i.taxonomy_id,
    t.slug                   as taxonomy_slug,
    t.name                   as taxonomy_name,
    t.trade_vertical,
    t.scope_domain,
    i.source_id,
    s.slug                   as source_slug,
    i.work_type,
    i.surface,
    i.coat_count,
    i.finish,
    i.unit,
    r.id                     as region_id,
    r.code                   as region_code,
    r.display_name           as region_display_name,
    m.effective_year,
    round(
      case
        when (coalesce(i.material_typical, 0) + coalesce(i.labor_typical, 0)) = 0
          then i.total_typical_with_op * m.labor_multiplier
        else (coalesce(i.material_typical, 0) * m.material_multiplier
              + coalesce(i.labor_typical, 0) * m.labor_multiplier)
             * (i.total_typical_with_op
                / (coalesce(i.material_typical, 0) + coalesce(i.labor_typical, 0)))
      end
    , 2) as typical
  from benchmark_items i
  join benchmark_taxonomy t on t.id = i.taxonomy_id
  join benchmark_sources s on s.id = i.source_id
  join benchmark_region_multipliers m on m.source_id = i.source_id
  join benchmark_regions r on r.id = m.region_id
  where i.active = true and t.active = true
) base;

-- Seeds (2 sources, 30 taxonomy nodes, 36 interior painting benchmark items,
-- 52 regions, 52 multipliers) were applied live in the SQL Editor the same date.
-- Benchmark data is admin-managed thereafter, so the seed rows are NOT duplicated here.
