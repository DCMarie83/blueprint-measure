-- Zone deductions: general SF/LF deduction support for non-wall zones.
-- Mirrors the existing opening_deductions jsonb pattern used on walls.

alter table public.zones
  add column if not exists deductions jsonb not null default '[]'::jsonb,
  add column if not exists gross_result numeric;

comment on column public.zones.deductions is
  'Array of {id, name, value} deduction objects for non-wall SF/LF zones. result = gross_result - sum(value).';

comment on column public.zones.gross_result is
  'Pre-deduction calculated value. NULL when no deductions exist (result IS gross). When deductions exist, gross_result holds the pre-deduction value and result holds the net.';
