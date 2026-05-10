import { supabase } from './supabase'

// Hardcoded fallback — used if the plans table query fails
const FALLBACK_PLANS = {
  basic:    { key: 'basic',    display_name: 'Basic',    monthly_price_cents: 15000, features: { blueprint_measurement: true, multi_page_pdf: false, csv_export: true,  redraw_zones: false, paint_calculator: false, ai_scale_detection: false, wall_calculator: false, test_mode: false }, storage_limit_mb: 5120,   seat_limit: 1,    blueprint_limit: 10,  is_active: true, sort_order: 1 },
  plus:     { key: 'plus',     display_name: 'Plus',     monthly_price_cents: 25000, features: { blueprint_measurement: true, multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true  }, storage_limit_mb: 10240,  seat_limit: 3,    blueprint_limit: 30,  is_active: true, sort_order: 2 },
  ultra:    { key: 'ultra',    display_name: 'Ultra',    monthly_price_cents: 39900, features: { blueprint_measurement: true, multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true  }, storage_limit_mb: 25600,  seat_limit: 10,   blueprint_limit: 100, is_active: true, sort_order: 3 },
  founders: { key: 'founders', display_name: 'Founders', monthly_price_cents: 5000,  features: { blueprint_measurement: true, multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true  }, storage_limit_mb: 5120,   seat_limit: 1,    blueprint_limit: 50,  is_active: true, sort_order: 4 },
  pilot:    { key: 'pilot',    display_name: 'Pilot',    monthly_price_cents: 0,     features: { blueprint_measurement: true, multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true  }, storage_limit_mb: null,   seat_limit: null, blueprint_limit: null, is_active: true, sort_order: 5 },
}

let cachedPlans = null
let cacheExpiry = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getAllPlans() {
  if (cachedPlans && Date.now() < cacheExpiry) return cachedPlans
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) throw error
    const map = {}
    data.forEach(p => { map[p.key] = p })
    cachedPlans = map
    cacheExpiry = Date.now() + CACHE_TTL
    return map
  } catch {
    return FALLBACK_PLANS
  }
}

export async function getPlan(key) {
  const plans = await getAllPlans()
  return plans[key] ?? FALLBACK_PLANS[key] ?? null
}

// Returns storage_limit_mb for a plan key. Falls back to FALLBACK_PLANS if DB plans aren't loaded.
export function getStorageLimitMb(planKey) {
  if (!planKey) return null
  const cached = cachedPlans?.[planKey]
  if (cached) return cached.storage_limit_mb ?? null
  return FALLBACK_PLANS[planKey]?.storage_limit_mb ?? null
}

// Returns display_name for a plan key (sync, uses cache/fallback).
export function getPlanDisplayName(planKey) {
  if (!planKey) return null
  const cached = cachedPlans?.[planKey]
  if (cached) return cached.display_name ?? planKey
  return FALLBACK_PLANS[planKey]?.display_name ?? planKey
}

// Returns an array of { value, label } suitable for <select> dropdowns.
// Sorted by sort_order. Sync — uses cached plans or fallback.
export function getPlanOptions() {
  const source = cachedPlans ?? FALLBACK_PLANS
  return Object.values(source)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(p => ({ value: p.key, label: p.display_name ?? p.key }))
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

// Force-refresh cache after a write
export function invalidatePlansCache() {
  cachedPlans = null
  cacheExpiry = 0
}
