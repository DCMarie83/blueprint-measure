// Canned data for the /try SUB demo. Painting-flavored, whole-trades voice,
// pun-free money. Nothing here touches Supabase — the flow renders entirely
// from this object. Values mirror the shapes of the real Lite surfaces
// (work_entries → invoice line items → home stats).

// fmtMoney replicated from src/lib/lite.js so money renders identically
// ($140.00), without importing a module that reaches for company context.
export function fmtMoney(val) {
  const n = Number(val) || 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

// unitLabel replicated from src/lib/lite.js (LITE_UNITS labels).
const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }
export function unitLabel(u) {
  return UNIT_LABELS[u] || u || ''
}

export const SUB_DEMO = {
  job: 'Maple Street Repaint',
  gc: 'Summit Builders',

  // The sub's own business — the letterhead on the invoice the GC receives.
  business: 'Riverside Painting Co.',
  paymentMethods: ['Zelle — pay@riversidepaint.co', 'Check payable to Riverside Painting Co.'],

  // The two ledger entries, matching the real work_entries meta shape:
  //   hourly → "{hours} hr × {fmtMoney(rate)}"
  //   piece  → "{quantity} {unitLabel(unit)} × {fmtMoney(rate)}"
  entries: {
    hourly: { id: 'e-hourly', type: 'hourly', name: 'Prime hallway walls', hours: 4, rate: 35, amount: 140 },
    piece: { id: 'e-piece', type: 'piece', name: 'Paint interior doors (2 coats)', quantity: 12, unit: 'each', rate: 45, amount: 540 },
  },

  // Day total counts up from the pre-filled hourly entry to both entries.
  dayTotal: { start: 140, full: 680 },

  // The roll-up invoice (one line item per entry, no aggregation — Lite precedent).
  invoice: { number: 'INV-1042', gc: 'Summit Builders', status: 'draft', total: 680 },

  // The sub home dashboard peek (mirrors useLiteHomeStats output).
  dashboard: {
    owed: { total: 2340, sub: '1 invoiced awaiting payment · logged, not yet invoiced' },
    earnedMTD: 4200,
    earnedYTD: 38500,
    loggedThisWeek: 680,
    outstanding: { amount: 2340, count: 2, paid: 5 },
    oldestUnpaid: { number: 'INV-1038', gc: 'Summit Builders', days: 12 },
  },

  payoff: 'Logged and invoiced in under a minute. Your Sundays are yours again.',
}
