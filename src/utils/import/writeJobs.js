import { supabase } from '../../lib/supabase'
import { makeClientCreator } from './placeholders'
import { appendBatchId, buildUpdatePatch } from './importHelpers'
import { logImportActivity } from './activity'

// Writer for the Jobs import. Rows arrive from the review step with matching
// and normalization already applied by the wizard config:
//   name, client (raw text), address
//   _clientId            matched existing client id, or null
//   _kanbanColumnId      resolved column id, or null (falls back to default)
//   _status              valid projects_status_check value
//   _contractValue       number or null
//   _scheduledStart / _estimatedCompletion  'YYYY-MM-DD' or null
//   _disposition / _existingId / _existing  upsert disposition
//
// portal_enabled stays at its DB default (false) and portal_email_sent_at is
// stamped so the auto-Scheduled portal email can never fire for imported jobs.
// This writer NEVER invokes any send-* edge function; client_activity rows are
// silent inserts backdated to the record date.
export async function writeJobRows({ rows, batchId, onProgress, companyId, userId, defaultColumnId }) {
  const imported = []
  const updated = []
  const skipped = []
  const failed = []
  const created = []

  const createClient = makeClientCreator({ companyId, batchId, created })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const raw = row._raw ?? row
    const name = (row.name || '').trim()

    if (!name) {
      skipped.push({ name: `Row ${i + 2}`, reason: 'missing_name' })
      onProgress?.(i + 1, rows.length)
      continue
    }

    try {
      const clientText = (row.client || '').trim()
      let clientId = row._clientId ?? null
      if (!clientId && clientText) {
        clientId = await createClient(clientText)
      }

      if (row._disposition === 'update' && row._existingId) {
        const patch = buildUpdatePatch({
          name,
          client_id: clientText ? clientId : null,
          client_name: clientText,
          address: (raw.address || '').trim(),
          status: (raw.status || '').trim() || (raw.column || '').trim() ? row._status : null,
          kanban_column_id: (raw.column || '').trim() ? row._kanbanColumnId : null,
          contract_value: (raw.contract_value || '').trim() ? row._contractValue : null,
          scheduled_start: row._scheduledStart,
          estimated_completion: row._estimatedCompletion,
        })
        patch.import_source = appendBatchId(row._existing?.import_source, batchId)
        patch.updated_at = new Date().toISOString()

        const { error: updErr } = await supabase.from('projects').update(patch).eq('id', row._existingId)
        if (updErr) throw new Error(updErr.message)
        updated.push({ name })
        onProgress?.(i + 1, rows.length)
        continue
      }

      const { data: project, error: insErr } = await supabase.from('projects').insert({
        user_id: userId,
        company_id: companyId,
        kanban_column_id: row._kanbanColumnId ?? defaultColumnId,
        name,
        client_id: clientId,
        client_name: clientText || null,
        address: (row.address || '').trim() || null,
        status: row._status,
        contract_value: row._contractValue,
        scheduled_start: row._scheduledStart,
        estimated_completion: row._estimatedCompletion,
        portal_email_sent_at: new Date().toISOString(),
        import_source: batchId,
      }).select('id').single()
      if (insErr) throw new Error(insErr.message)
      row._createdId = project.id

      await logImportActivity({
        companyId,
        userId,
        clientId,
        activityType: 'job_created',
        title: `Job ${name} imported`,
        createdAt: row._scheduledStart ?? undefined,
        metadata: { import_source: batchId, project_id: project.id },
      })

      imported.push({ name })
    } catch (err) {
      failed.push({ name, error: err.message || String(err) })
    }

    onProgress?.(i + 1, rows.length)
  }

  return { imported, updated, skipped, failed, created }
}
