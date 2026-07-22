// ════════════════════════════════════════════════════════════════════
// smartBid.js — benchmark + library helpers for the Smart Bid wizard, plus
// the send-time market-position snapshot. Pure functions + thin supabase
// query helpers; no React, no hooks.
// ════════════════════════════════════════════════════════════════════

// True when an estimate should render the Smart layer: it was Smart-created, or
// any line carries a non-null priced_from. Non-smart estimates render as today.
export function isSmartEstimate(estimate, lineItems) {
  if (estimate?.smart_created) return true
  return (lineItems || []).some(li => li.priced_from != null)
}

// Resolve a region code's display name from benchmark_regions.
async function resolveRegionName(supabase, code) {
  try {
    const { data } = await supabase
      .from('benchmark_regions')
      .select('code, display_name')
      .eq('code', code)
      .maybeSingle()
    return { code, display_name: data?.display_name || code }
  } catch {
    return { code, display_name: code }
  }
}

// Fetch regional low/typical/high for a set of benchmark_item_ids at regionCode,
// falling back to 'US' when the company state is null or the state query returns
// zero rows. Returns { map, resolvedRegion: { code, display_name }, usedFallback }.
export async function fetchBenchmarksByItemIds(supabase, regionCode, benchmarkItemIds) {
  const ids = [...new Set((benchmarkItemIds || []).filter(Boolean))]
  if (ids.length === 0) {
    const usedFallback = !regionCode
    const resolvedRegion = await resolveRegionName(supabase, usedFallback ? 'US' : regionCode)
    return { map: new Map(), resolvedRegion, usedFallback }
  }
  const code = regionCode || 'US'
  let usedFallback = !regionCode
  const cols = 'benchmark_item_id, local_low, local_typical, local_high, region_code, region_name, source_name'
  let { data, error } = await supabase
    .from('v_benchmark_regional')
    .select(cols)
    .eq('region_code', code)
    .in('benchmark_item_id', ids)
  if (error) throw error
  if (!data || data.length === 0) {
    usedFallback = true
    const fb = await supabase
      .from('v_benchmark_regional')
      .select(cols)
      .eq('region_code', 'US')
      .in('benchmark_item_id', ids)
    if (fb.error) throw fb.error
    data = fb.data || []
  }
  const map = new Map()
  for (const r of data) map.set(r.benchmark_item_id, r)
  const resolvedRegion = await resolveRegionName(supabase, usedFallback ? 'US' : code)
  return { map, resolvedRegion, usedFallback }
}

// The five painting scopes the wizard prices from measurements, keyed by the
// surface CATEGORY a measurement group classifies to. taxonomy_slug + work_type
// (+ surface where the scope needs it) address a row in v_benchmark_regional.
export const SMART_BENCHMARK_DEFAULTS = {
  Wall:    { taxonomy_slug: 'int-walls',    work_type: 'complete_prep_prime_2_coats_roller' },
  Ceiling: { taxonomy_slug: 'int-ceilings', work_type: 'complete_prep_prime_2_coats_roller' },
  Trim:    { taxonomy_slug: 'int-trim',     work_type: 'paint_2_coats_brush' },
  Door:    { taxonomy_slug: 'int-doors',    work_type: 'primer_plus_2_coats', surface: 'wood_flush_door' },
  Window:  { taxonomy_slug: 'int-windows',  work_type: 'primer_plus_2_coats', surface: 'window_1_6_lite' },
}

// The taxonomy slugs the wizard ever asks the benchmark view for.
export const SMART_TAXONOMY_SLUGS = ['int-walls', 'int-ceilings', 'int-trim', 'int-doors', 'int-windows']

// Name-contains keywords per category for preselecting a library item.
export const LIBRARY_KEYWORDS = {
  Wall: ['wall'],
  Ceiling: ['ceiling'],
  Trim: ['trim', 'baseboard', 'crown', 'molding'],
  Door: ['door'],
  Window: ['window'],
}

// Classify a measurement group to a surface CATEGORY from its type + surface +
// zone names. SF -> Wall/Ceiling, LF -> Trim, count -> Door/Window.
export function classifyGroup(measurementType, surfaceType, name = '') {
  const mt = String(measurementType || '').toUpperCase()
  const st = String(surfaceType || '').toLowerCase()
  const nm = String(name || '').toLowerCase()
  if (mt === 'SF') return st.includes('ceiling') ? 'Ceiling' : 'Wall'
  if (mt === 'LF') return 'Trim'
  if (mt === 'COUNT') return (nm.includes('window') || st.includes('window')) ? 'Window' : 'Door'
  return null
}

// Measure-unit -> estimate purchase unit (sf/lf/each). Measure units and
// purchase units are separate vocabularies; this only maps the estimate side.
export function unitForMeasurementType(mt) {
  switch (String(mt || '').toUpperCase()) {
    case 'SF': return 'sf'
    case 'LF': return 'lf'
    case 'COUNT': return 'each'
    default: return 'each'
  }
}

// Human category label for a line description.
export function categoryLabel(category) {
  return ({ Wall: 'Walls', Ceiling: 'Ceilings', Trim: 'Trim', Door: 'Doors', Window: 'Windows' })[category] || category || 'Scope'
}

// PRESELECT a library item for a category: case-insensitive name-contains on the
// keyword list AND exact unit match against active pricing items; first match in
// library (keyword) order wins. Returns the item or null. The actual line->library
// linkage uses the editor's existing pricing_item_id mechanic.
export function matchLibraryItem(pricingItems, category, unit) {
  const keywords = LIBRARY_KEYWORDS[category]
  if (!keywords) return null
  // Seeded starter rates are examples only — they must never price a Smart Bid
  // line. Only the contractor's own ('user') or adopted ('smart_bid') rows match.
  const active = (pricingItems || []).filter(it => it.is_active !== false && it.source !== 'seeded')
  const wantUnit = String(unit || '').toLowerCase()
  for (const kw of keywords) {
    const hit = active.find(it =>
      String(it.name || '').toLowerCase().includes(kw) &&
      String(it.unit || '').toLowerCase() === wantUnit
    )
    if (hit) return hit
  }
  return null
}

// Query v_benchmark_regional for the mapped slugs at regionCode, falling back to
// 'US' when the company state is null or the state query returns zero rows.
// Returns { regionCodeUsed, bySlug, resolvedRegion: { code, display_name }, usedFallback }.
export async function fetchRegionalBenchmarks(supabase, regionCode) {
  const code = regionCode || 'US'
  let usedFallback = !regionCode
  let { data, error } = await supabase
    .from('v_benchmark_regional')
    .select('*')
    .eq('region_code', code)
    .in('taxonomy_slug', SMART_TAXONOMY_SLUGS)
  if (error) throw error
  if (!data || data.length === 0) {
    usedFallback = true
    const fb = await supabase
      .from('v_benchmark_regional')
      .select('*')
      .eq('region_code', 'US')
      .in('taxonomy_slug', SMART_TAXONOMY_SLUGS)
    if (fb.error) throw fb.error
    data = fb.data || []
  }
  const bySlug = new Map()
  for (const r of data) {
    if (!bySlug.has(r.taxonomy_slug)) bySlug.set(r.taxonomy_slug, [])
    bySlug.get(r.taxonomy_slug).push(r)
  }
  const regionCodeUsed = data[0]?.region_code || 'US'
  const resolvedRegion = await resolveRegionName(supabase, usedFallback ? 'US' : code)
  return { regionCodeUsed, bySlug, resolvedRegion, usedFallback }
}

// Pick the benchmark row for a SMART_BENCHMARK_DEFAULTS entry: match work_type
// (and surface when the entry specifies one), then fall back progressively.
export function pickBenchmark(bySlug, def) {
  if (!def || !bySlug) return null
  const rows = bySlug.get(def.taxonomy_slug) || []
  if (rows.length === 0) return null
  return (
    rows.find(r => r.work_type === def.work_type && (!def.surface || r.surface === def.surface)) ||
    rows.find(r => r.work_type === def.work_type) ||
    rows[0] ||
    null
  )
}

// Send-time snapshot. Applicable when the estimate is smart_created OR any line
// carries priced_from. Writes benchmark_typical_total, bid_position,
// pricing_source_mix, position_snapshot_at. Throws on query/update failure — the
// caller is responsible for catching so the send is never blocked.
export async function snapshotEstimateOnSend(supabase, { estimate, lineItems, companyState }) {
  const lines = lineItems || []
  const applicable = estimate?.smart_created || lines.some(li => li.priced_from)
  if (!applicable) return null

  // Bid total per the single-price convention (the 'good' columns).
  const bidTotal = Number(estimate?.good_total) || lines.reduce((s, li) => s + (Number(li.total_good) || 0), 0)

  // pricing_source_mix: counts of library / benchmark / manual (null -> manual).
  const mix = { library: 0, benchmark: 0, manual: 0 }
  for (const li of lines) {
    const k = li.priced_from === 'library' ? 'library' : li.priced_from === 'benchmark' ? 'benchmark' : 'manual'
    mix[k] += 1
  }

  let benchmarkTypicalTotal = null
  let position = null

  const benchLines = lines.filter(li => li.benchmark_item_id)
  if (benchLines.length > 0) {
    const ids = [...new Set(benchLines.map(li => li.benchmark_item_id))]
    const code = companyState || 'US'
    let { data, error } = await supabase
      .from('v_benchmark_regional')
      .select('benchmark_item_id, local_low, local_typical, local_high, region_code, region_name, source_name')
      .eq('region_code', code)
      .in('benchmark_item_id', ids)
    if (error) throw error
    if (!data || data.length === 0) {
      const fb = await supabase
        .from('v_benchmark_regional')
        .select('benchmark_item_id, local_low, local_typical, local_high, region_code, region_name, source_name')
        .eq('region_code', 'US')
        .in('benchmark_item_id', ids)
      if (fb.error) throw fb.error
      data = fb.data || []
    }
    const byId = new Map(data.map(r => [r.benchmark_item_id, r]))
    let lowSum = 0, typSum = 0, highSum = 0
    for (const li of benchLines) {
      const r = byId.get(li.benchmark_item_id)
      if (!r) continue
      const qty = Number(li.quantity) || 0
      lowSum += qty * (Number(r.local_low) || 0)
      typSum += qty * (Number(r.local_typical) || 0)
      highSum += qty * (Number(r.local_high) || 0)
    }
    benchmarkTypicalTotal = Math.round(typSum * 100) / 100
    position = bidTotal < lowSum ? 'below' : bidTotal > highSum ? 'above' : 'within'
  }

  const patch = {
    benchmark_typical_total: benchmarkTypicalTotal,
    bid_position: position,
    pricing_source_mix: mix,
    position_snapshot_at: new Date().toISOString(),
  }
  const { error: updErr } = await supabase.from('estimates').update(patch).eq('id', estimate.id)
  if (updErr) throw updErr
  return { bid_position: position }
}
