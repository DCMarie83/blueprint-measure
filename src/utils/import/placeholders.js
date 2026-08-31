import { supabase } from '../../lib/supabase'
import { guessClientType } from './importHelpers'

// Placeholder-parent creation shared by the Jobs and Invoices importers.
// Placeholders are deduped within the run (same text → one row) and stamped
// with import_source = `<batch>:placeholder` so a batch can be found/undone.

export function makeClientCreator({ companyId, batchId, created }) {
  const cache = new Map() // lower(name) → client id
  return async function createPlaceholderClient(rawName) {
    const name = String(rawName ?? '').trim()
    const key = name.toLowerCase()
    if (cache.has(key)) return cache.get(key)
    const { data, error } = await supabase
      .from('clients')
      .insert({
        company_id: companyId,
        display_name: name,
        client_type: guessClientType(name),
        status: 'active',
        import_source: `${batchId}:placeholder`,
      })
      .select('id')
      .single()
    if (error) throw new Error(`Client "${name}": ${error.message}`)
    cache.set(key, data.id)
    created.push({ type: 'client', name })
    return data.id
  }
}

export function makeProjectCreator({ companyId, userId, batchId, created, kanbanColumnId }) {
  const cache = new Map() // lower(name) → { id, client_id }
  return async function createPlaceholderProject(rawName, { clientId, clientName }) {
    const name = String(rawName ?? '').trim()
    const key = name.toLowerCase()
    if (cache.has(key)) return cache.get(key)
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        company_id: companyId,
        kanban_column_id: kanbanColumnId,
        name,
        client_id: clientId ?? null,
        client_name: clientName || null,
        status: 'complete',
        portal_email_sent_at: new Date().toISOString(),
        import_source: `${batchId}:placeholder`,
      })
      .select('id, client_id')
      .single()
    if (error) throw new Error(`Job "${name}": ${error.message}`)
    cache.set(key, data)
    created.push({ type: 'job', name })
    return data
  }
}
