// Shared vocabulary for the Time & Pay Lite surfaces.
// Units map 1:1 onto the existing pricing vocabulary (sf/lf/each/hour/lump_sum)
// so nothing here expands a DB CHECK constraint.

export const GC_CLIENT_TYPE = 'general_contractor'

export const LITE_UNITS = [
  { value: 'sf', label: 'SF' },
  { value: 'lf', label: 'LF' },
  { value: 'each', label: 'Each' },
  { value: 'hour', label: 'Hour' },
  { value: 'lump_sum', label: 'Lump Sum' },
]

export const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }

export const SEGMENTS = [
  { value: 'all', label: 'All' },
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
]

export function unitLabel(unit) {
  return UNIT_LABELS[unit] || unit || ''
}

// Money math is client-side everywhere in Lite (no DB total triggers),
// mirroring the invoice precedent.
export function fmtMoney(val) {
  const n = Number(val) || 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
