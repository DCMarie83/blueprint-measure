import { supabase } from '../lib/supabase'

// Move or delete ONE stored document. Every query scopes by company_id as
// well as id; RLS (A22 on the table, A23 on the bucket) stays the enforcement
// layer. Activity is a 'note' on the affected client: one row per action.
//
// Files can be SHARED: the G52 dedupe points several documents rows at one
// stored object. Delete removes the object only when no other row uses it;
// otherwise only this attachment goes and the file stays for the others.

const BUCKET = 'import-documents'

export const DOCUMENT_ERROR = {
  SOLE_PAYMENT_PROOF: 'sole_payment_proof',
  STORAGE_DENIED: 'storage_denied',
  NOT_FOUND: 'not_found',
}

function docError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

const TYPE_WORD = { invoice: 'invoice', estimate: 'estimate', project: 'job', client: 'client' }

// { type, id, label, text, clientId, status } for a linked record, or null
// when it is not one of the four record types / not in this company. `text`
// is the plain-English phrase activity titles use ("invoice 7780").
export async function describeRecord(companyId, type, id) {
  if (!companyId || !id || !TYPE_WORD[type]) return null
  let label = ''
  let clientId = null
  let status = null
  if (type === 'invoice') {
    const { data } = await supabase.from('invoices').select('invoice_number, status, client_id, projects(client_id)').eq('company_id', companyId).eq('id', id).maybeSingle()
    if (!data) return null
    label = data.invoice_number
    clientId = data.client_id ?? data.projects?.client_id ?? null
    status = data.status
  } else if (type === 'estimate') {
    const { data } = await supabase.from('estimates').select('estimate_number, projects(client_id)').eq('company_id', companyId).eq('id', id).maybeSingle()
    if (!data) return null
    label = data.estimate_number
    clientId = data.projects?.client_id ?? null
  } else if (type === 'project') {
    const { data } = await supabase.from('projects').select('name, client_id').eq('company_id', companyId).eq('id', id).maybeSingle()
    if (!data) return null
    label = data.name
    clientId = data.client_id ?? null
  } else {
    const { data } = await supabase.from('clients').select('display_name').eq('company_id', companyId).eq('id', id).maybeSingle()
    if (!data) return null
    label = data.display_name
    clientId = id
  }
  return { type, id, label: label ?? '', text: `${TYPE_WORD[type]} ${label ?? ''}`.trim(), clientId, status }
}

async function logNote({ companyId, userId, clientId, title, metadata }) {
  if (!clientId) return
  try {
    await supabase.from('client_activity').insert({
      company_id: companyId,
      client_id: clientId,
      user_id: userId ?? null,
      activity_type: 'note',
      title,
      is_automated: true,
      metadata,
    })
  } catch { /* activity logging never fails the action */ }
}

const fileName = (doc) => doc.original_filename || String(doc.bucket_path ?? '').split('/').pop()
const recordMeta = (r) => (r ? { type: r.type, id: r.id, label: r.label } : null)

async function getDocument(companyId, documentId) {
  const { data, error } = await supabase
    .from('documents')
    .select('id, linked_type, linked_id, bucket_path, doc_type, original_filename')
    .eq('company_id', companyId).eq('id', documentId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw docError(DOCUMENT_ERROR.NOT_FOUND, 'Document not found in this company.')
  return data
}

// How many OTHER documents rows of the company point at the same stored file.
export async function countOtherFileUses(companyId, doc) {
  const { count, error } = await supabase
    .from('documents').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('bucket_path', doc.bucket_path).neq('id', doc.id)
  if (error) throw new Error(error.message)
  return count ?? 0
}

// The one refusal: the document is the ONLY payment proof on a PAID invoice.
// Returns true when deleting must be refused.
export async function isSolePaymentProof(companyId, doc, record = null) {
  if (doc.doc_type !== 'payment_proof' || doc.linked_type !== 'invoice') return false
  const rec = record ?? await describeRecord(companyId, 'invoice', doc.linked_id)
  if (rec?.status !== 'paid') return false
  const { count, error } = await supabase
    .from('documents').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('linked_type', 'invoice').eq('linked_id', doc.linked_id)
    .eq('doc_type', 'payment_proof').neq('id', doc.id)
  if (error) throw new Error(error.message)
  return (count ?? 0) === 0
}

// Re-point the document at another record. One activity row, on the source
// record's client (the target's when the source has none).
export async function moveDocument({ companyId, userId, documentId, targetType, targetId }) {
  const doc = await getDocument(companyId, documentId)
  const [from, to] = await Promise.all([
    describeRecord(companyId, doc.linked_type, doc.linked_id),
    describeRecord(companyId, targetType, targetId),
  ])
  if (!to) throw docError(DOCUMENT_ERROR.NOT_FOUND, 'Target record not found in this company.')
  if (doc.linked_type === targetType && doc.linked_id === targetId) return { unchanged: true }

  const { error } = await supabase.from('documents')
    .update({ linked_type: targetType, linked_id: targetId })
    .eq('company_id', companyId).eq('id', documentId)
  if (error) throw new Error(error.message)

  await logNote({
    companyId,
    userId,
    clientId: from?.clientId ?? to.clientId,
    title: `Document ${fileName(doc)} moved${from ? ` from ${from.text}` : ''} to ${to.text}`,
    metadata: { document_id: doc.id, filename: fileName(doc), from: recordMeta(from), to: recordMeta(to) },
  })
  return { to }
}

// Storage object first, then the row: a failed storage delete leaves the row
// (and throws) rather than orphaning a file. A file other rows still use is
// kept. Storage reports an RLS-blocked delete as "nothing removed", not as an
// error, so an empty result is checked: the object is either already gone
// (continue) or still there (refuse).
export async function deleteDocument({ companyId, userId, documentId }) {
  const doc = await getDocument(companyId, documentId)
  const record = await describeRecord(companyId, doc.linked_type, doc.linked_id)
  if (await isSolePaymentProof(companyId, doc, record)) {
    throw docError(DOCUMENT_ERROR.SOLE_PAYMENT_PROOF, 'This is the only payment proof on a paid invoice.')
  }

  const otherUses = await countOtherFileUses(companyId, doc)
  let fileRemoved = false
  if (otherUses === 0) {
    const { data: removed, error: rmErr } = await supabase.storage.from(BUCKET).remove([doc.bucket_path])
    if (rmErr) throw new Error(rmErr.message)
    fileRemoved = (removed ?? []).length > 0
    if (!fileRemoved) {
      const slash = doc.bucket_path.lastIndexOf('/')
      const { data: listed, error: listErr } = await supabase.storage.from(BUCKET)
        .list(doc.bucket_path.slice(0, slash), { search: doc.bucket_path.slice(slash + 1) })
      if (listErr) throw new Error(listErr.message)
      const stillThere = (listed ?? []).some(o => o.name === doc.bucket_path.slice(slash + 1))
      if (stillThere) throw docError(DOCUMENT_ERROR.STORAGE_DENIED, 'The file could not be removed from storage.')
    }
  }

  const { error: delErr } = await supabase.from('documents').delete().eq('company_id', companyId).eq('id', documentId)
  if (delErr) throw new Error(delErr.message)

  await logNote({
    companyId,
    userId,
    clientId: record?.clientId ?? null,
    title: `Document ${fileName(doc)} deleted${record ? ` from ${record.text}` : ''}`,
    metadata: { document_id: doc.id, filename: fileName(doc), from: recordMeta(record), file_removed: fileRemoved, bucket_path: doc.bucket_path },
  })
  return { fileRemoved, otherUses }
}
