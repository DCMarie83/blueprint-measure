import { supabase } from '../../lib/supabase'
import { makeClientCreator, makeProjectCreator } from './placeholders'
import { appendBatchId, buildUpdatePatch } from './importHelpers'

// Writer for the Change Orders import (public.change_orders, prod table).
// Rows arrive from the review step with:
//   co_number, job_name, title (required), description, approved_by, external_ref
//   _amount        signed number or null (column is nullable)
//   _status        proposed|approved|declined|void
//   _approvedAt    'YYYY-MM-DD' or null
//   _source        'buildertrend' when the row says so, else 'import'
//   _projectId / _clientId / _disposition / _existingId
// Unmatched job names auto-create a placeholder project (D1 rules: complete
// column, portal email disarmed). Nothing here sends anything.
export async function writeChangeOrderRows({
  rows, batchId, onProgress, companyId, userId, placeholderColumnId,
}) {
  const imported = []
  const updated = []
  const skipped = []
  const failed = []
  const created = []

  const createClient = makeClientCreator({ companyId, batchId, created })
  const createProject = makeProjectCreator({
    companyId, userId, batchId, created, kanbanColumnId: placeholderColumnId,
  })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const raw = row._raw ?? row
    const title = (row.title || '').trim()
    const label = (row.co_number || '').trim() || title || `Row ${i + 2}`

    if (!title) {
      skipped.push({ name: label, reason: 'missing_title' })
      onProgress?.(i + 1, rows.length)
      continue
    }

    try {
      if (row._disposition === 'update' && row._existingId) {
        const patch = buildUpdatePatch({
          title,
          description: (row.description || '').trim(),
          amount: (raw.amount || '').trim() ? row._amount : null,
          status: (raw.status || '').trim() || row._approvedAt ? row._status : null,
          approved_at: row._approvedAt,
          approved_by: (row.approved_by || '').trim(),
          external_ref: (row.external_ref || '').trim(),
        })
        patch.import_source = appendBatchId(row._existing?.import_source, batchId)
        patch.updated_at = new Date().toISOString()

        const { error: updErr } = await supabase.from('change_orders').update(patch).eq('id', row._existingId)
        if (updErr) throw new Error(updErr.message)
        updated.push({ name: label })
        onProgress?.(i + 1, rows.length)
        continue
      }

      const clientText = (row.client || '').trim()
      let clientId = row._clientId ?? null
      if (!clientId && clientText) {
        clientId = await createClient(clientText)
      }

      let projectId = row._projectId ?? null
      if (!projectId) {
        const proj = await createProject(row.job_name, { clientId, clientName: clientText })
        projectId = proj.id
      }

      const { data: co, error: insErr } = await supabase
        .from('change_orders')
        .insert({
          company_id: companyId,
          project_id: projectId,
          co_number: (row.co_number || '').trim() || null,
          source: row._source,
          title,
          description: (row.description || '').trim() || null,
          amount: row._amount,
          status: row._status,
          approved_at: row._approvedAt,
          approved_by: (row.approved_by || '').trim() || null,
          external_ref: (row.external_ref || '').trim() || null,
          import_source: batchId,
          created_by: userId,
        })
        .select('id')
        .single()
      if (insErr) throw new Error(insErr.message)
      row._createdId = co.id

      imported.push({ name: label })
    } catch (err) {
      failed.push({ name: label, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, updated, skipped, failed, created }
}
