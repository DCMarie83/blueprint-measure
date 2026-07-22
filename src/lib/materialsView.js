// Presentation helpers shared by the materials v2 flow (start / quick / swiper / table).
import { materialBuyQuantity } from '../utils/measurements'
import { humanizeSlug } from './materialsResolve'

// Build id->row and slug->row lookups from catalog rows.
export function buildCatalogLookups(catalogRows) {
  const byId = new Map()
  const bySlug = new Map()
  for (const r of (catalogRows || [])) {
    byId.set(r.id, r)
    if (!bySlug.has(r.taxonomy_slug)) bySlug.set(r.taxonomy_slug, r)
  }
  return { byId, bySlug }
}

// Resolve ItemVisual inputs for a line: prefer a catalog row reached via any
// grade's catalog_item_*_id (DB rows), else via the line's taxonomy_slug
// (freshly-seeded in-memory lines).
export function itemVisualProps(line, lookups) {
  const byId = lookups?.byId
  const bySlug = lookups?.bySlug
  const catId = line?.catalog_item_standard_id || line?.catalog_item_premium_id || line?.catalog_item_commercial_id
  const row = (catId && byId?.get(catId)) || (line?.taxonomy_slug && bySlug?.get(line.taxonomy_slug)) || null
  return {
    imageUrl: row?.image_url || null,
    taxonomySlug: row?.taxonomy_slug || line?.taxonomy_slug || null,
    quantityRule: row?.quantity_rule || null,
  }
}

// Section category for a line: humanized taxonomy_slug, or "Other items" when
// the line maps to no catalog slug.
export function categoryForLine(line, lookups) {
  const slug = itemVisualProps(line, lookups).taxonomySlug
  return slug ? humanizeSlug(slug) : 'Other items'
}

export const GRADES = [
  { key: 'premium', label: 'Premium' },
  { key: 'standard', label: 'Standard' },
  { key: 'commercial', label: 'Commercial' },
]

// Flat, exact money.
export function money(n) {
  return '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Cost of one line at a grade: buy quantity (coats + overage + 0.25 gallon
// rounding) x the grade's unit cost. Matches the table math exactly.
export function lineCostAtGrade(line, grade) {
  const cost = Number(line[`cost_${grade}`])
  if (!cost || cost < 0) return 0
  return materialBuyQuantity(line) * cost
}

export function gradeTotal(lines, grade) {
  return (lines || []).reduce((sum, l) => sum + lineCostAtGrade(l, grade), 0)
}

export { materialBuyQuantity }
