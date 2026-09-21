import { supabase } from '../lib/supabase'

// Lane V: client reassignment. One shared helper for both doors:
//   moveJobToClient    — the job is the anchor; its invoices, estimates,
//                        documents, and activity follow.
//   moveRecordToClient — one invoice or estimate moves to a job under another
//                        client (existing job, or one created here).
// No DELETE anywhere. The payments ledger keys by invoice_id and is never
// touched — paid and void invoices move safely, so there is no refusal.
// Every select and update scopes by company_id as well as record id; a record,
// job, or client that is not in the caller's company refuses the move with a
// coded error (err.code) the dialog translates. RLS stays the enforcement
// layer; the explicit scope is the platform rule.
// Activity uses type 'client_reassigned'.

export const REASSIGN_ERROR = {
  WRONG_COMPANY: 'wrong_company',
  JOB_REQUIRED: 'job_required',
}

function reassignError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function wrongCompany() {
  return reassignError(REASSIGN_ERROR.WRONG_COMPANY, 'That record does not belong to this company, so nothing was moved.')
}

async function getClient(companyId, clientId) {
  if (!clientId) return null
  const { data, error } = await supabase
    .from('clients').select('id, display_name').eq('company_id', companyId).eq('id', clientId).maybeSingle()
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
      activity_type: 'client_reassigned',
      title,
      is_automated: true,
      metadata,
    })
  } catch { /* activity logging never fails a move */ }
}

// Move the whole job. Every invoice on it re-points its own client_id; the
// job's estimates and documents key by project/record id and follow on their
// own; client_activity rows that reference the job's records move to the new
// client so the timelines stay truthful.
export async function moveJobToClient({ companyId, userId, projectId, targetClientId }) {
  if (!companyId) throw wrongCompany()

  const { data: proj, error: projErr } = await supabase
    .from('projects').select('id, name, client_id').eq('company_id', companyId).eq('id', projectId).maybeSingle()
  if (projErr) throw new Error(projErr.message)
  if (!proj) throw wrongCompany()
  if (proj.client_id === targetClientId) return { unchanged: true }

  const [oldClient, newClient] = await Promise.all([getClient(companyId, proj.client_id), getClient(companyId, targetClientId)])
  if (!newClient) throw wrongCompany()

  const [{ data: invs, error: invErr }, { data: ests, error: estErr }] = await Promise.all([
    supabase.from('invoices').select('id, invoice_number').eq('company_id', companyId).eq('project_id', projectId),
    supabase.from('estimates').select('id').eq('company_id', companyId).eq('project_id', projectId),
  ])
  if (invErr) throw new Error(invErr.message)
  if (estErr) throw new Error(estErr.message)

  // Invoices carry their own client_id (the LTV trigger fires on this column).
  // They move BEFORE the job: a legacy invoice with a null client_id resolves
  // its old client through the job, so the job must still point at the old
  // client when the trigger runs or the old client's lifetime value goes stale.
  const { error: upInvErr } = await supabase.from('invoices')
    .update({ client_id: targetClientId }).eq('company_id', companyId).eq('project_id', projectId)
  if (upInvErr) throw new Error(upInvErr.message)

  const { error: upProjErr } = await supabase.from('projects')
    .update({ client_id: targetClientId, client_name: newClient.display_name, updated_at: new Date().toISOString() })
    .eq('company_id', companyId).eq('id', projectId)
  if (upProjErr) throw new Error(upProjErr.message)

  // Activity follows: rows on the OLD client that reference this job's records.
  if (proj.client_id) {
    const followers = () => supabase.from('client_activity').update({ client_id: targetClientId })
      .eq('company_id', companyId).eq('client_id', proj.client_id)
    const moves = [followers().eq('metadata->>project_id', projectId)]
    const invIds = (invs ?? []).map(r => r.id)
    if (invIds.length > 0) moves.push(followers().in('metadata->>invoice_id', invIds))
    const estIds = (ests ?? []).map(r => r.id)
    if (estIds.length > 0) moves.push(followers().in('metadata->>estimate_id', estIds))
    for (const m of moves) {
      const { error } = await m
      if (error) throw new Error(error.message)
    }
  }

  // Jobs carry no number; record_number holds the job name.
  const meta = {
    record_type: 'job',
    record_id: projectId,
    record_number: proj.name,
    from_client_id: proj.client_id,
    to_client_id: targetClientId,
    scope: 'job',
  }
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
  if (!companyId) throw wrongCompany()
  const table = kind === 'estimate' ? 'estimates' : 'invoices'
  const numberCol = kind === 'estimate' ? 'estimate_number' : 'invoice_number'

  const { data: rec, error: recErr } = await supabase
    .from(table).select(`id, ${numberCol}, project_id`).eq('company_id', companyId).eq('id', recordId).maybeSingle()
  if (recErr) throw new Error(recErr.message)
  if (!rec) throw wrongCompany()

  const { data: oldProj, error: oldProjErr } = rec.project_id
    ? await supabase.from('projects').select('id, name, client_id').eq('company_id', companyId).eq('id', rec.project_id).maybeSingle()
    : { data: null, error: null }
  if (oldProjErr) throw new Error(oldProjErr.message)
  const [oldClient, newClient] = await Promise.all([getClient(companyId, oldProj?.client_id ?? null), getClient(companyId, targetClientId)])
  if (!newClient) throw wrongCompany()

  let projectId = targetProjectId
  if (projectId) {
    // The chosen job must be this company's and already under the target client.
    const { data: targetProj, error: targetErr } = await supabase
      .from('projects').select('id').eq('company_id', companyId).eq('client_id', targetClientId).eq('id', projectId).maybeSingle()
    if (targetErr) throw new Error(targetErr.message)
    if (!targetProj) throw wrongCompany()
  } else {
    if (!newJob?.name?.trim()) throw reassignError(REASSIGN_ERROR.JOB_REQUIRED, 'A target job is required.')
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
  const { error: upErr } = await supabase.from(table).update(patch).eq('company_id', companyId).eq('id', recordId)
  if (upErr) throw new Error(upErr.message)

  const label = kind === 'estimate' ? `Estimate ${rec[numberCol]}` : `Invoice ${rec[numberCol]}`
  const meta = {
    record_type: kind === 'estimate' ? 'estimate' : 'invoice',
    record_id: recordId,
    record_number: rec[numberCol] ?? null,
    from_client_id: oldProj?.client_id ?? null,
    to_client_id: targetClientId,
    scope: 'record',
  }
  await logMove({ companyId, userId, clientId: oldProj?.client_id ?? null, title: `${label} moved to ${newClient.display_name}`, metadata: meta })
  await logMove({ companyId, userId, clientId: targetClientId, title: `${label} moved here${oldClient ? ` from ${oldClient.display_name}` : ''}`, metadata: meta })

  return { projectId }
}
