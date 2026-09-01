import { supabase } from '../../lib/supabase'

// Writer for the Pricing Library import. Rows arrive normalized:
//   name (required), description
//   _unit          normalized to sf|lf|each|hour|lump_sum
//   _rate          number > 0 (required)
//   category       raw category text; resolved or created by name
// Dedupe key is normalized name + unit (the same normKey convention the Smart
// Bid adopt flow uses); existing keys skip in add mode and update the rate in
// update modes. All rows are written with source 'user'.
export async function writePricingItemRows({ rows, onProgress, companyId, existingByKey, categories }) {
  const imported = []
  const updated = []
  const skipped = []
  const failed = []
  const created = []

  const catCache = new Map() // lower(name) → id
  for (const c of categories ?? []) {
    const key = (c.name || '').trim().toLowerCase()
    if (key && !catCache.has(key)) catCache.set(key, c.id)
  }
  let nextSort = (categories?.length ?? 0) + 1

  async function resolveCategory(rawName) {
    const name = (rawName || '').trim() || 'Imported'
    const key = name.toLowerCase()
    if (catCache.has(key)) return catCache.get(key)
    const { data, error } = await supabase
      .from('pricing_categories')
      .insert({ company_id: companyId, name, sort_order: nextSort++ })
      .select('id')
      .single()
    if (error) throw new Error(`Category "${name}": ${error.message}`)
    catCache.set(key, data.id)
    return data.id
  }

  const seen = new Map(existingByKey) // normKey → existing item

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = (row.name || '').trim()
    const label = name || `Row ${i + 2}`

    if (!name || !(row._rate > 0)) {
      skipped.push({ name: label, reason: 'missing_fields' })
      onProgress?.(i + 1, rows.length)
      continue
    }

    const key = `${name.toLowerCase()}|${row._unit}`

    try {
      const existing = seen.get(key)
      if (existing) {
        if (row._disposition === 'update' && row._existingId) {
          const { error: updErr } = await supabase
            .from('pricing_items')
            .update({
              default_rate: row._rate,
              description: (row.description || '').trim() || undefined,
              source: 'user',
              updated_at: new Date().toISOString(),
            })
            .eq('id', row._existingId)
          if (updErr) throw new Error(updErr.message)
          updated.push({ name: label })
        } else {
          skipped.push({ name: label, reason: 'exists' })
        }
        onProgress?.(i + 1, rows.length)
        continue
      }

      const categoryId = await resolveCategory(row.category)
      const { data, error: insErr } = await supabase
        .from('pricing_items')
        .insert({
          company_id: companyId,
          category_id: categoryId,
          name,
          unit: row._unit,
          default_rate: row._rate,
          description: (row.description || '').trim() || null,
          source: 'user',
        })
        .select('id')
        .single()
      if (insErr) throw new Error(insErr.message)
      row._createdId = data.id
      seen.set(key, { id: data.id })

      imported.push({ name: label })
    } catch (err) {
      failed.push({ name: label, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, updated, skipped, failed, created }
}
