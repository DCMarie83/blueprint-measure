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

// An OPEN clock-in punch: clocked in, not yet clocked out (hours/amount not yet
// computed). This is the ONE row shape every money aggregate must skip — it is
// not billable work until it closes. NOTE: we key on the clock fields, not on
// `hours IS NULL`, because piece entries also carry hours:null and must stay in
// the sums. A punch is punch-BACKED (closed, invoiceable) when BOTH clock stamps
// are set — see punchBacked().
export function isOpenPunch(e) {
  return !!e?.clock_in_at && !e?.clock_out_at
}

// A CLOSED clock punch — carries both stamps, so it rides the invoice with its
// times. Manual hourly/piece entries have no clock_in_at and return false.
export function punchBacked(e) {
  return !!e?.clock_in_at && !!e?.clock_out_at
}

// Money math is client-side everywhere in Lite (no DB total triggers),
// mirroring the invoice precedent.
export function fmtMoney(val) {
  const n = Number(val) || 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

// Resolve an invoice due date from a GC's billing_terms, counting from a
// base date (YYYY-MM-DD). due_on_receipt = the base date; net_N = base + N days;
// custom / unset = no due date (null). Kept string-based so no timezone drift.
const NET_DAYS = { net_15: 15, net_30: 30, net_45: 45, net_60: 60 }
export function invoiceDueDate(billingTerms, fromDate) {
  if (!fromDate) return null
  if (billingTerms === 'due_on_receipt') return fromDate
  const days = NET_DAYS[billingTerms]
  if (!days) return null // custom, null, or unrecognized → leave open
  const d = new Date(fromDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
