// ════════════════════════════════════════════════════════════
// entitlements.js — Effective-value resolver for seats, features, prices
//
// Computes a company's real entitlements by resolving:
//   1. Exemption check (pilot / internal → full unlimited)
//   2. Per-company overrides (locked prices, seat override)
//   3. Live plan values (seats, features)
//   4. Grandfather defaults (no plan linked)
//
// STAGE 1: Built parallel to the existing frozen-snapshot model.
// Nothing calls this at runtime yet — existing reads are untouched.
// A verification harness (verifyEntitlements) compares resolver
// output against the current frozen system for every company.
// ════════════════════════════════════════════════════════════

import { FEATURE_KEYS, GRANDFATHER_DEFAULTS } from './plans'

// All known feature keys, derived from the canonical FEATURE_KEYS list.
const ALL_FEATURE_KEYS = FEATURE_KEYS.map(f => f.key)

// Build a features object with every known key set to true.
function allFeaturesEnabled() {
  const features = {}
  for (const key of ALL_FEATURE_KEYS) features[key] = true
  return features
}

/**
 * Resolve a company's effective entitlements.
 *
 * @param {object} company — row from companies table (needs: subscription_status,
 *   is_internal, locked_price_monthly, locked_price_annual, plan_key, features)
 * @param {object|null} plan — matching row from plans table (needs: max_seats,
 *   features, monthly_price, annual_price). Null when company has no plan_key
 *   or the plan is archived/missing.
 * @returns {{ seats: number|null, features: object, priceMonthly: number|null,
 *   priceAnnual: number|null, isExempt: boolean }}
 */
export function resolveEntitlements(company, plan) {
  if (!company) {
    return {
      seats: GRANDFATHER_DEFAULTS.max_seats,
      features: { ...GRANDFATHER_DEFAULTS.features },
      priceMonthly: null,
      priceAnnual: null,
      isExempt: false,
    }
  }

  // ── 1. Exemption check (ALWAYS first) ──────────────────────
  // Pilots and internal accounts get full unlimited access to
  // every feature with no seat cap. They still use their locked
  // price if set (pilots are free, but the field is preserved
  // for data consistency).
  const isExempt =
    company.subscription_status === 'pilot' ||
    company.is_internal === true

  if (isExempt) {
    return {
      isExempt: true,
      seats: null, // null = unlimited (no cap)
      features: allFeaturesEnabled(),
      // Prices: locked price if set, else plan price, else null.
      // Pilots are free in practice but we preserve the data.
      priceMonthly: company.locked_price_monthly ?? plan?.monthly_price ?? null,
      priceAnnual: company.locked_price_annual ?? plan?.annual_price ?? null,
    }
  }

  // ── 2. Non-exempt: resolve each dimension ──────────────────

  // SEATS: read LIVE from the plan. No frozen company copy.
  // seat_limit_override is a per-company admin override that
  // takes precedence when set (non-null).
  const seats = company.seat_limit_override ?? plan?.max_seats ?? GRANDFATHER_DEFAULTS.max_seats

  // FEATURES: read LIVE from the plan's current features.
  // The company.features snapshot is ignored — the plan is the
  // source of truth. If no plan is linked, fall back to
  // grandfather defaults (all features enabled).
  const planFeatures = plan?.features ?? GRANDFATHER_DEFAULTS.features
  const features = {}
  for (const key of ALL_FEATURE_KEYS) {
    features[key] = planFeatures[key] === true
  }

  // PRICES: the ONE value that does NOT simply inherit from plan.
  // locked_price_monthly/annual are permanent per-company overrides,
  // set at signup and immune to later plan price changes. This is
  // the founder lifetime-lock mechanism — a company that signed up
  // at $79.00 keeps $79.00 even if the plan price later becomes
  // $79.99. These are NEVER cleared or inherited.
  const priceMonthly = company.locked_price_monthly ?? plan?.monthly_price ?? null
  const priceAnnual = company.locked_price_annual ?? plan?.annual_price ?? null

  return { isExempt: false, seats, features, priceMonthly, priceAnnual }
}

/**
 * Compare resolver output against the current frozen-snapshot system
 * for a single company. Returns an object describing any differences.
 *
 * "Current system" means:
 *   - seats: company.seat_limit_override ?? plan.max_seats ?? 2
 *   - features: company.features (the frozen snapshot)
 *   - prices: company.locked_price_monthly ?? plan.monthly_price (already correct)
 *
 * @param {object} company — company row
 * @param {object|null} plan — plan row (matched by plan_key)
 * @returns {{ company: string, resolved: object, current: object, diffs: string[] }}
 */
export function compareEntitlements(company, plan) {
  const resolved = resolveEntitlements(company, plan)

  // Current system: seats (same logic as CompanySeatDisplay)
  const currentSeats = company.seat_limit_override ?? plan?.max_seats ?? GRANDFATHER_DEFAULTS.max_seats

  // Current system: features (frozen snapshot from company row)
  const currentFeatures = company.features ?? GRANDFATHER_DEFAULTS.features

  // Current system: prices (same as useCompanyPlan — already override-first)
  const currentPriceMonthly = company.locked_price_monthly ?? plan?.monthly_price ?? null
  const currentPriceAnnual = company.locked_price_annual ?? plan?.annual_price ?? null

  const diffs = []

  // Compare seats (null = unlimited in resolver, treat carefully)
  const resolvedSeats = resolved.seats
  if (resolvedSeats !== currentSeats) {
    // Exempt companies get null (unlimited) — current system may show a number
    if (resolved.isExempt && currentSeats != null) {
      diffs.push(`seats: resolver=unlimited, current=${currentSeats}`)
    } else {
      diffs.push(`seats: resolver=${resolvedSeats}, current=${currentSeats}`)
    }
  }

  // Compare features key by key
  for (const key of ALL_FEATURE_KEYS) {
    const rVal = resolved.features[key] === true
    const cVal = currentFeatures[key] === true
    if (rVal !== cVal) {
      diffs.push(`feature.${key}: resolver=${rVal}, current=${cVal}`)
    }
  }

  // Compare prices
  const rPM = resolved.priceMonthly != null ? Number(resolved.priceMonthly) : null
  const cPM = currentPriceMonthly != null ? Number(currentPriceMonthly) : null
  if (rPM !== cPM) {
    diffs.push(`priceMonthly: resolver=${rPM}, current=${cPM}`)
  }
  const rPA = resolved.priceAnnual != null ? Number(resolved.priceAnnual) : null
  const cPA = currentPriceAnnual != null ? Number(currentPriceAnnual) : null
  if (rPA !== cPA) {
    diffs.push(`priceAnnual: resolver=${rPA}, current=${cPA}`)
  }

  return {
    companyId: company.id,
    companyName: company.name,
    planKey: company.plan_key ?? '(none)',
    status: company.subscription_status,
    isInternal: company.is_internal,
    resolved,
    current: {
      seats: currentSeats,
      features: currentFeatures,
      priceMonthly: currentPriceMonthly,
      priceAnnual: currentPriceAnnual,
    },
    diffs,
    match: diffs.length === 0,
  }
}

/**
 * Run the verification harness across all companies.
 * Call from browser console: import('/src/lib/entitlements.js').then(m => m.verifyEntitlements())
 *
 * Fetches all companies + all plans, runs compareEntitlements for each,
 * and logs results grouped by match/diff status.
 */
export async function verifyEntitlements() {
  // Dynamic import to avoid adding supabase as a module-level dependency
  // of this pure-logic file (keeps resolveEntitlements testable without DB).
  const { supabase } = await import('./supabase')

  const { data: companies, error: cErr } = await supabase
    .from('companies')
    .select('*')
    .order('name')
  if (cErr) {
    console.error('[entitlements] Failed to load companies:', cErr.message)
    return
  }

  const { data: plans, error: pErr } = await supabase
    .from('plans')
    .select('*')
  if (pErr) {
    console.error('[entitlements] Failed to load plans:', pErr.message)
    return
  }

  const plansByKey = {}
  for (const p of plans) plansByKey[p.key] = p

  const results = companies.map(c => {
    const plan = c.plan_key ? plansByKey[c.plan_key] : null
    return compareEntitlements(c, plan)
  })

  const matches = results.filter(r => r.match)
  const diverged = results.filter(r => !r.match)

  console.group('[entitlements] Verification Harness')
  console.log(`Total companies: ${results.length}`)
  console.log(`Match (resolver = current): ${matches.length}`)
  console.log(`Diverged (resolver ≠ current): ${diverged.length}`)

  if (diverged.length > 0) {
    console.group('Divergences')
    for (const r of diverged) {
      console.group(`${r.companyName} (${r.planKey}, ${r.status}${r.isInternal ? ', internal' : ''})`)
      for (const d of r.diffs) console.log(d)
      console.groupEnd()
    }
    console.groupEnd()
  }

  // Summary table
  console.table(results.map(r => ({
    company: r.companyName,
    plan: r.planKey,
    status: r.status,
    internal: r.isInternal,
    exempt: r.resolved.isExempt,
    seats_resolved: r.resolved.seats ?? '∞',
    seats_current: r.current.seats ?? '∞',
    price_resolved: r.resolved.priceMonthly,
    price_current: r.current.priceMonthly,
    match: r.match ? '✓' : `✗ (${r.diffs.length})`,
  })))

  console.groupEnd()

  return results
}
