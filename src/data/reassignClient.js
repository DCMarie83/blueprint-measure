import { supabase } from '../lib/supabase'

// Lane V: client reassignment. One shared helper for both doors:
//   moveJobToClient    — the job is the anchor; its invoices, estimates,
//                        documents, and activity follow.
//   moveRecordToClient — one invoice or estimate moves to a job under another
//                        client (existing job, or one created here).
// No DELETE anywhere. The payments ledger keys by invoice_id and is never
// touched — paid and void invoices move safely, so there is no refusal.
// Activity uses type 'note' (no fitting type exists yet; 'client_reassigned'
// is the type to add by hand when the CHECK is widened).

async function getClient(clientId) {
  if (!clientId) return null
  const { data, error } = await supabase.from('clients').select('id, display_name').eq('id', clientId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

async function logMove({ companyId, userId, clientId, title, metadata }) {
  if (!clientId) return
  try {
    await supabase.from('client_activity').insert({
      company_id: companyId,
      client_id: clientId,
      user_id: userId ?? null,
      activity_type: 'note',
      title,
      is_automated: true,
      metadata: metadata ?? null,
    })
  } catch { /* activity logging never fails a move */ }
}

// Move the whole job. Every invoice on it re-points its own client_id; the
// job's estimates and documents key by project/record id and follow on their
// own; client_activity rows that reference the job's records move to the new
// client so the timelines stay truthful.
export async function moveJobToClient({ companyId, userId, projectId, targetClientId }) {
  const { data: proj, error: projErr } = await supabase
    .from('projects').select('id, name, client_id').eq('id', projectId).single()
  if (projErr) throw new Error(projErr.message)
  if (proj.client_id === targetClientId) return { unchanged: true }

  const [oldClient, newClient] = await Promise.all([getClient(proj.client_id), getClient(targetClientId)])
  if (!newClient) throw new Error('Target client not found')

  const [{ data: invs, error: invErr }, { data: ests, error: estErr }] = await Promise.all([
    supabase.from('invoices').select('id, invoice_number').eq('project_id', projectId),
    supabase.from('estimates').select('id').eq('project_id', projectId),
  ])
  if (invErr) throw new Error(invErr.message)
  if (estErr) throw new Error(estErr.message)

  const { error: upProjErr } = await supabase.from('projects')
    .update({ client_id: targetClientId, client_name: newClient.display_name, updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (upProjErr) throw new Error(upProjErr.message)

  // Invoices carry their own client_id (the LTV trigger fires on this column).
  const { error: upInvErr } = await supabase.from('invoices')
    .update({ client_id: targetClientId }).eq('project_id', projectId)
  if (upInvErr) throw new Error(upInvErr.message)

  // Activity follows: rows on the OLD client that reference this job's records.
  if (proj.client_id) {
    const moves = [
      supabase.from('client_activity').update({ client_id: targetClientId })
        .eq('client_id', proj.client_id).eq('metadata->>project_id', projectId),
    ]
    const invIds = (invs ?? []).map(r => r.id)
    if (invIds.length > 0) {
      moves.push(supabase.from('client_activity').update({ client_id: targetClientId })
        .eq('client_id', proj.client_id).in('metadata->>invoice_id', invIds))
    }
    const estIds = (ests ?? []).map(r => r.id)
    if (estIds.length > 0) {
      moves.push(supabase.from('client_activity').update({ client_id: targetClientId })
        .eq('client_id', proj.client_id).in('metadata->>estimate_id', estIds))
    }
    for (const m of moves) {
      const { error } = await m
      if (error) throw new Error(error.message)
    }
  }

  const meta = { project_id: projectId, from_client_id: proj.client_id, to_client_id: targetClientId }
  await logMove({ companyId, userId, clientId: proj.client_id, title: `Job ${proj.name} moved to ${newClient.display_name}`, metadata: meta })
  await logMove({ companyId, userId, clientId: targetClientId, title: `Job ${proj.name} moved here${oldClient ? ` from ${oldClient.display_name}` : ''}`, metadata: meta })

  return { movedInvoices: (invs ?? []).length }
}

// Move ONE invoice or estimate to a job under another client. targetProjectId
// picks an existing job of that client; newJob {name, address} creates one
// (complete column, like the importer's history jobs). Documents key by
// linked record id and follow on their own; ledger rows key by invoice_id and
// stay put.
export async function moveRecordToClient({ kind, companyId, userId, recordId, targetClientId, targetProjectId = null, newJob = null }) {
  const table = kind === 'estimate' ? 'estimates' : 'invoices'
  const numberCol = kind === 'estimate' ? 'estimate_number' : 'invoice_number'

  const { data: rec, error: recErr } = await supabase
    .from(table).select(`id, ${numberCol}, project_id`).eq('id', recordId).single()
  if (recErr) throw new Error(recErr.message)

  const { data: oldProj } = rec.project_id
    ? await supabase.from('projects').select('id, name, client_id').eq('id', rec.project_id).maybeSingle()
    : { data: null }
  const [oldClient, newClient] = await Promise.all([getClient(oldProj?.client_id ?? null), getClient(targetClientId)])
  if (!newClient) throw new Error('Target client not found')

  let projectId = targetProjectId
  if (!projectId) {
    if (!newJob?.name?.trim()) throw new Error('A target job is required')
    const { data: cols, error: colErr } = await supabase
      .from('kanban_columns').select('id, column_key, position').eq('company_id', companyId).order('position', { ascending: true })
    if (colErr) throw new Error(colErr.message)
    const completeCol = (cols ?? []).find(c => c.column_key === 'complete') ?? (cols ?? [])[0]
    const { data: created, error: createErr } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        company_id: companyId,
        kanban_column_id: completeCol?.id ?? null,
        name: newJob.name.trim(),
        address: (newJob.address ?? '').trim() || null,
        client_id: targetClientId,
        client_name: newClient.display_name,
        status: 'complete',
        portal_email_sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (createErr) throw new Error(createErr.message)
    projectId = created.id
  }

  const patch = kind === 'estimate'
    ? { project_id: projectId, updated_at: new Date().toISOString() }
    : { project_id: projectId, client_id: targetClientId, updated_at: new Date().toISOString() }
  const { error: upErr } = await supabase.from(table).update(patch).eq('id', recordId)
  if (upErr) throw new Error(upErr.message)

  const label = kind === 'estimate' ? `Estimate ${rec[numberCol]}` : `Invoice ${rec[numberCol]}`
  const meta = {
    [`${kind}_id`]: recordId,
    from_client_id: oldProj?.client_id ?? null,
    to_client_id: targetClientId,
    to_project_id: projectId,
  }
  await logMove({ companyId, userId, clientId: oldProj?.client_id ?? null, title: `${label} moved to ${newClient.display_name}`, metadata: meta })
  await logMove({ companyId, userId, clientId: targetClientId, title: `${label} moved here${oldClient ? ` from ${oldClient.display_name}` : ''}`, metadata: meta })

  return { projectId }
}
