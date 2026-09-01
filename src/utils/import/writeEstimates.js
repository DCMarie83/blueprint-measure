import { supabase } from '../../lib/supabase'
import { makeClientCreator, makeProjectCreator } from './placeholders'
import { appendBatchId, buildUpdatePatch, normalizeUnit } from './importHelpers'

// Writer for the Estimates import. Rows arrive from the review step with:
//   estimate_number  legacy number stored verbatim — generate_estimate_number
//                    is NEVER called (no unique-format collision is possible)
//   job_name, client, notes
//   _estimateDate    'YYYY-MM-DD' (required) — becomes created_at/updated_at
//   _total           number — stored on good_total; better/best hard-zeroed
//   _status          normalized to draft|sent|accepted|declined|expired|changes_requested
//   _lines           optional [{ description, category, unit, quantity, unit_rate }]
//   _projectId / _projectClientId / _clientId / _disposition / _existingId
//
// selected_variant and accepted_variant stay NULL (single-price convention).
// Lines land in estimate_line_items with rate_good/total_good, priced_from
// NULL (never renders the Smart layer), category_name '' when absent.
// No send-* function is ever invoked; nothing emails anyone on create.
// One normalization for both the create and update paths: single-price lines
// on rate_good/total_good, priced_from NULL, category_name '' when absent.
// Per-line money honors the extracted printed total: qty×rate when both are
// present, else a printed-total line becomes a lump_sum (qty 1, rate = total).
// Lines with no description AND no money are dropped.
function normalizeEstimateLines(rawLines) {
  return (rawLines ?? []).map(li => {
    let qty = Number(li.quantity) || 0
    let rate = Number(li.unit_rate) || 0
    const printed = Number(li.total) || 0
    let unit = normalizeUnit(li.unit, 'sf')
    let total = 0
    if (qty > 0 && rate > 0) {
      total = Math.round(qty * rate * 100) / 100
    } else if (printed > 0) {
      qty = 1
      unit = 'lump_sum'
      rate = printed
      total = printed
    }
    return {
      description: (li.description || '').trim(),
      category_name: (li.category || li.category_name || '').trim() || '',
      unit,
      quantity: qty,
      rate_good: rate,
      rate_better: 0,
      rate_best: 0,
      total_good: total,
      total_better: 0,
      total_best: 0,
      priced_from: null,
    }
  })
    .filter(li => li.description !== '' || li.total_good !== 0)
    .map((li, idx) => ({ ...li, description: li.description || '—', sort_order: idx }))
}

export async function writeEstimateRows({
  rows, batchId, onProgress, companyId, userId, existingNumbers, placeholderColumnId,
}) {
  const imported = []
  const updated = []
  const skipped = []
  const failed = []
  const created = []

  const seenNumbers = new Set(existingNumbers)
  const createClient = makeClientCreator({ companyId, batchId, created })
  const createProject = makeProjectCreator({
    companyId, userId, batchId, created, kanbanColumnId: placeholderColumnId,
  })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const raw = row._raw ?? row
    const number = (row.estimate_number || '').trim()
    const label = number || `Row ${i + 2}`

    try {
      const clientText = (row.client || '').trim()

      if (row._disposition === 'update' && row._existingId) {
        const hasDate = !!row._estimateDate
        const patch = buildUpdatePatch({
          status: (raw.status || '').trim() ? row._status : null,
          good_total: (raw.total || '').trim() ? row._total : null,
          notes: (row.notes || '').trim(),
          created_at: hasDate ? row._estimateDate : null,
          updated_at: hasDate ? row._estimateDate : null,
        })
        patch.import_source = appendBatchId(row._existing?.import_source, batchId)
        if (!patch.updated_at) patch.updated_at = new Date().toISOString()

        // Extracted / sheet lines fill in a header-only skeleton: insert them
        // ONLY when the existing estimate has zero line items.
        if (row._lines?.length > 0) {
          const { count, error: cntErr } = await supabase
            .from('estimate_line_items')
            .select('id', { count: 'exact', head: true })
            .eq('estimate_id', row._existingId)
          if (cntErr) throw new Error(cntErr.message)
          if ((count ?? 0) === 0) {
            const lines = normalizeEstimateLines(row._lines)
            const { error: liErr } = await supabase.from('estimate_line_items').insert(
              lines.map(li => ({ ...li, estimate_id: row._existingId }))
            )
            if (liErr) throw new Error(`Line items failed: ${liErr.message}`)
          }
        }

        const { error: updErr } = await supabase.from('estimates').update(patch).eq('id', row._existingId)
        if (updErr) throw new Error(updErr.message)
        updated.push({ name: label })
        onProgress?.(i + 1, rows.length)
        continue
      }

      const numberKey = number.toLowerCase()
      if (numberKey && seenNumbers.has(numberKey)) {
        skipped.push({ name: label, reason: 'duplicate_number' })
        onProgress?.(i + 1, rows.length)
        continue
      }

      let clientId = row._clientId ?? null
      if (!clientId && clientText) {
        clientId = await createClient(clientText)
      }

      let projectId = row._projectId ?? null
      if (!projectId) {
        const proj = await createProject(row.job_name, { clientId, clientName: clientText })
        projectId = proj.id
      }

      const status = row._status
      const stamps = {}
      if (status === 'sent') stamps.sent_at = row._estimateDate
      if (status === 'accepted') { stamps.sent_at = row._estimateDate; stamps.accepted_at = row._estimateDate }
      if (status === 'declined') { stamps.sent_at = row._estimateDate; stamps.declined_at = row._estimateDate }

      const { data: estimate, error: insErr } = await supabase
        .from('estimates')
        .insert({
          project_id: projectId,
          company_id: companyId,
          estimate_number: number,
          status,
          good_total: row._total ?? 0,
          better_total: 0,
          best_total: 0,
          notes: (row.notes || '').trim() || null,
          created_by: userId,
          created_at: row._estimateDate,
          updated_at: row._estimateDate,
          import_source: batchId,
          ...stamps,
        })
        .select('id')
        .single()
      if (insErr) throw new Error(insErr.message)
      row._createdId = estimate.id

      const lines = normalizeEstimateLines(row._lines).map(li => ({ ...li, estimate_id: estimate.id }))
      if (lines.length > 0) {
        const { error: liErr } = await supabase.from('estimate_line_items').insert(lines)
        if (liErr) {
          if (numberKey) seenNumbers.add(numberKey)
          throw new Error(`Estimate created but line items failed: ${liErr.message}`)
        }
      }

      if (numberKey) seenNumbers.add(numberKey)
      imported.push({ name: label })
    } catch (err) {
      failed.push({ name: label, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, updated, skipped, failed, created }
}
