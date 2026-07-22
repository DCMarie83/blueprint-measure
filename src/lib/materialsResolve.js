// ════════════════════════════════════════════════════════════════════
// materialsResolve.js — pure catalog-resolution helpers, extracted from
// useMaterialOrderBuilder so both the materials-order builder and the Smart
// Bid wizard resolve slugs, prices, provenance, and sundries identically.
//
// Everything here is a pure function of its arguments (fetched rows in, plain
// objects out). No hooks, no supabase, no React.
// ════════════════════════════════════════════════════════════════════

import { estimateMaterials } from '../utils/measurements'

// Turn a taxonomy_slug into a readable, generic line description. Grade-specific
// product/brand names live in product_premium/standard/commercial, not here.
export function humanizeSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Effective unit price for a catalog row: the company's override if set, else
// the catalog's typical_price, else null.
export function priceForRow(row, overrideMap) {
  if (!row) return null
  const ov = overrideMap.get(row.id)
  return ov != null ? ov : (row.typical_price ?? null)
}

// Resolve one taxonomy_slug to the graded product names, effective costs, and
// provenance ids. Returns null when the slug isn't in the catalog.
export function resolveSlug(slug, slugMap, overrideMap) {
  const grades = slugMap.get(slug)
  if (!grades) return null
  const standard = grades.standard || null
  // Grade-invariant fallback: a slug that carries only a standard row is the same
  // product at every grade. Premium/commercial inherit the standard row's product,
  // cost, AND id, so provenance stays truthful (the id points at the real row).
  const premium = grades.premium || standard || null
  const commercial = grades.commercial || standard || null
  const displayRow = standard || premium || commercial || null
  return {
    displayRow,
    fields: {
      product_premium: premium?.name ?? null,
      product_standard: standard?.name ?? null,
      product_commercial: commercial?.name ?? null,
      cost_premium: priceForRow(premium, overrideMap),
      cost_standard: priceForRow(standard, overrideMap),
      cost_commercial: priceForRow(commercial, overrideMap),
      catalog_item_premium_id: premium?.id ?? null,
      catalog_item_standard_id: standard?.id ?? null,
      catalog_item_commercial_id: commercial?.id ?? null,
    },
  }
}

// Build the slug -> {premium, standard, commercial} row map from active catalog
// rows, plus the max price_as_of across them. display_order is assumed already
// applied to the input ordering.
export function buildSlugMap(catalogRows) {
  const slugMap = new Map()
  let maxPriceAsOf = null
  for (const r of (catalogRows || [])) {
    if (!slugMap.has(r.taxonomy_slug)) slugMap.set(r.taxonomy_slug, {})
    slugMap.get(r.taxonomy_slug)[r.grade] = r
    if (r.price_as_of && (!maxPriceAsOf || r.price_as_of > maxPriceAsOf)) maxPriceAsOf = r.price_as_of
  }
  return { slugMap, maxPriceAsOf }
}

// Build the catalog_item_id -> price override map from company_material_prices rows.
export function buildOverrideMap(priceRows) {
  const overrideMap = new Map()
  for (const p of (priceRows || [])) overrideMap.set(p.catalog_item_id, Number(p.price))
  return overrideMap
}

// Deterministic sundries computed from the catalog (per_area / per_job rules),
// keyed off the job's total painted base SF (coats NOT multiplied). Skips any
// slug/description already present in existingLines. Returns plain line objects.
export function computeSundryLines({ zones, slugMap, overrideMap, existingLines = [] }) {
  const totalPaintedSF = (zones || []).reduce(
    (s, z) => (z.measurement_type === 'SF' && Number(z.result) > 0 ? s + Number(z.result) : s),
    0
  )

  const seenSlugs = new Set(existingLines.map(l => l.taxonomy_slug).filter(Boolean))
  const seenDescriptions = new Set(existingLines.map(l => (l.description || '').trim().toLowerCase()))

  const sundrySlugs = []
  for (const [slug, grades] of slugMap.entries()) {
    const anyRow = grades.standard || grades.premium || grades.commercial
    if (!anyRow) continue
    if (anyRow.quantity_rule !== 'per_area' && anyRow.quantity_rule !== 'per_job') continue
    sundrySlugs.push({ slug, anyRow })
  }
  sundrySlugs.sort((a, b) =>
    (a.anyRow.display_order ?? 0) - (b.anyRow.display_order ?? 0) || a.slug.localeCompare(b.slug))

  const lines = []
  for (const { slug, anyRow } of sundrySlugs) {
    const desc = humanizeSlug(slug)
    if (seenSlugs.has(slug) || seenDescriptions.has(desc.trim().toLowerCase())) continue

    let qty
    if (anyRow.quantity_rule === 'per_area') {
      const per1000 = Number(anyRow.qty_per_1000sf) || 0
      qty = Math.max(1, Math.ceil((totalPaintedSF / 1000) * per1000))
    } else {
      qty = Number(anyRow.qty_per_job) || 1
    }

    const resolved = resolveSlug(slug, slugMap, overrideMap)
    const dr = resolved?.displayRow
    lines.push({
      taxonomy_slug: slug,
      description: desc,
      unit: dr?.purchase_unit || '',
      quantity: qty,
      coats: 1,
      overage_pct: 0,
      source_zone_name: '',
      ai_suggested: false,
      ...(resolved?.fields || {}),
    })
    seenSlugs.add(slug)
    seenDescriptions.add(desc.trim().toLowerCase())
  }
  return lines
}

// Pure, in-memory suggestion source: the deterministic paint (coverage) lines
// from measurements plus catalog sundries (per_area / per_job). Returns the
// proposed lines WITHOUT persisting. This is the single source consumed by
// seedFromZones (which persists it verbatim), Quick Total, and the swiper — so
// all three see identical proposed lines.
export function buildSuggestedLines({ zones, slugMap, overrideMap }) {
  const paintLines = estimateMaterials(zones || [], { vertical: 'paint' })
  // Resolve each coverage line to the catalog at suggestion time (v3 fix): wall
  // vs ceiling comes from the structural surface_type the estimator emits, not the
  // description. Fills products/costs/provenance identical in shape to sundries.
  // A line that maps to no catalog row stays unresolved (null costs), never guessed.
  const lines = paintLines.map((m, idx) => {
    const slug = m.surface_type === 'Ceiling' ? 'paint-ceiling-interior' : 'paint-wall-interior'
    const resolved = resolveSlug(slug, slugMap, overrideMap)
    return { ...m, taxonomy_slug: slug, ...(resolved?.fields || {}), sort_order: idx }
  })
  const sundries = computeSundryLines({ zones: zones || [], slugMap, overrideMap, existingLines: lines })
  for (const s of sundries) lines.push({ ...s, sort_order: lines.length })
  return lines
}
