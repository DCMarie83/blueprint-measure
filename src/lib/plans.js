// ════════════════════════════════════════════════════════════
// plans.js — Plan definitions + backward-compatible helpers
//
// Phase 2a-2: Legacy synchronous helpers now return universal
// defaults matching the flat-tier model. Phase 2b will migrate
// callers to use the usePlans/usePlan hooks from PlansContext.
// ════════════════════════════════════════════════════════════

// Grandfather defaults — used by synchronous helpers when plan_id is null
// or for legacy callers that haven't migrated to hooks yet.
// Matches the new universal model: all paying tenants get all features, 5GB, 2 seats.
export const GRANDFATHER_DEFAULTS = {
  key: 'legacy',
  display_name: 'Legacy',
  max_seats: 2,
  max_storage_gb: 5,
  features: {
    blueprint_measurement: true,
    multi_page_pdf: true,
    csv_export: true,
    redraw_zones: true,
    paint_calculator: true,
    ai_scale_detection: true,
    wall_calculator: true,
    test_mode: true,
  },
}

// Feature flag keys with display labels. Single source of truth.
export const FEATURE_KEYS = [
  { key: 'blueprint_measurement', label: 'Blueprint Measurement' },
  { key: 'multi_page_pdf',       label: 'Multi-page PDF' },
  { key: 'csv_export',           label: 'CSV Export' },
  { key: 'redraw_zones',         label: 'Redraw Zones' },
  { key: 'paint_calculator',     label: 'Paint Calculator' },
  { key: 'ai_scale_detection',   label: 'AI Scale Detection' },
  { key: 'wall_calculator',      label: 'Wall Calculator' },
  { key: 'test_mode',            label: 'Test Mode' },
]

// ── DEPRECATED synchronous helpers ──────────────────────────
// Return universal defaults so legacy callers keep compiling.
// Phase 2b refactors each caller to use hooks.

export async function getAllPlans() {
  return {}
}

export async function getPlan(key) {
  return null
}

export function getStorageLimitMb() {
  return GRANDFATHER_DEFAULTS.max_storage_gb * 1024
}

export function getPlanDisplayName(planKey) {
  return planKey || 'Legacy'
}

export function getPlanOptions() {
  return []
}

export function invalidatePlansCache() {
  // no-op — caching now handled by PlansContext
}

// Re-export hooks for one-stop import
export { usePlans, usePlan, useCompanyPlan, PlansProvider } from '../context/PlansContext'
