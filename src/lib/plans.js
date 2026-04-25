import { supabase } from './supabase'

// Hardcoded fallback — used if the plans table query fails
const FALLBACK_PLANS = {
  basic:    { key: 'basic',    display_name: 'Basic',    monthly_price_cents: 15000, features: { multi_page_pdf: false, csv_export: true,  redraw_zones: false, paint_calculator: false, ai_scale_detection: false, wall_calculator: false, test_mode: false }, storage_limit_mb: 5120,   seat_limit: 1,    blueprint_limit: 10,  is_active: true, sort_order: 1 },
  plus:     { key: 'plus',     display_name: 'Plus',     monthly_price_cents: 25000, features: { multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true  }, storage_limit_mb: 25600,  seat_limit: 3,    blueprint_limit: 30,  is_active: true, sort_order: 2 },
  ultra:    { key: 'ultra',    display_name: 'Ultra',    monthly_price_cents: 39900, features: { multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true  }, storage_limit_mb: 102400, seat_limit: 10,   blueprint_limit: 100, is_active: true, sort_order: 3 },
  founders: { key: 'founders', display_name: 'Founders', monthly_price_cents: 5000,  features: { multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true  }, storage_limit_mb: 25600,  seat_limit: 1,    blueprint_limit: 50,  is_active: true, sort_order: 4 },
  pilot:    { key: 'pilot',    display_name: 'Pilot',    monthly_price_cents: 0,     features: { multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true  }, storage_limit_mb: null,   seat_limit: null, blueprint_limit: null, is_active: true, sort_order: 5 },
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

// Force-refresh cache after a write
export function invalidatePlansCache() {
  cachedPlans = null
  cacheExpiry = 0
}
