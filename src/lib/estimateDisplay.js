// ════════════════════════════════════════════════════════════
// estimateDisplay.js — Single-price display helpers
//
// Old tiered estimates (accepted/sent on 'better' or 'best')
// display that variant's numbers. New estimates use 'good'
// columns as the single price. One shared fallback — no
// surface hand-rolls the variant resolution.
// ════════════════════════════════════════════════════════════

/**
 * Which variant's columns to read for display.
 * Old accepted-on-best → 'best'. New single-price → 'good'.
 */
export function getDisplayVariant(est) {
  if (!est) return 'good'
  return est.accepted_variant || est.selected_variant || 'good'
}

/**
 * The estimate's display total (the one grand total to show).
 */
export function getDisplayTotal(est) {
  if (!est) return 0
  const v = getDisplayVariant(est)
  return Number(est[`${v}_total`]) || 0
}

/**
 * A line item's display rate for the estimate's variant.
 */
export function getDisplayRate(li, est) {
  const v = getDisplayVariant(est)
  return Number(li[`rate_${v}`]) || 0
}

/**
 * A line item's display total for the estimate's variant.
 */
export function getDisplayLineTotal(li, est) {
  const v = getDisplayVariant(est)
  return Number(li[`total_${v}`]) || 0
}
