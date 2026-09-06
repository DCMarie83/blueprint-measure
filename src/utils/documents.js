import { supabase } from '../lib/supabase'
import { mintBatchId } from './import/importHelpers'

// Shared document attach layer (G54 + wizard Attach mode). Attach-only by
// design: these helpers write storage objects and documents rows and NEVER
// touch any field on the record they link to (doc-mode money boundary).

export const DOC_TYPES = ['blueprint', 'plan', 'receipt', 'payment_proof', 'photo', 'spreadsheet', 'contract', 'other']

// Widened accepted set (G54). Extraction mode stays narrower — the
// extract-documents function only reads pdf/jpg/jpeg/png, and its base64
// inflation caps practical extraction size below the attach cap.
export const ATTACH_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'xlsx', 'csv', 'docx']
export const ATTACH_ACCEPT = ATTACH_EXTS.map(e => `.${e}`).join(',')
export const ATTACH_MAX_BYTES = 25 * 1024 * 1024

export function guessDocType(filename) {
  const ext = String(filename ?? '').split('.').pop()?.toLowerCase()
  if (['xlsx', 'csv'].includes(ext)) return 'spreadsheet'
  if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return 'photo'
  if (ext === 'docx') return 'contract'
  return 'other'
}

export function validateAttachFile(file) {
  const ext = String(file.name ?? '').split('.').pop()?.toLowerCase()
  if (!ATTACH_EXTS.includes(ext)) return 'type'
  if (file.size > ATTACH_MAX_BYTES) return 'size'
  return null
}

// G52 dedupe: same company + original filename + size means the bytes are
// already in the bucket. We never re-upload; if a row already links the SAME
// record we return it untouched, otherwise a new documents row reuses the
// existing bucket_path so prior links are never stolen.
export async function uploadDocument({ companyId, userId, file, docType, linkedType, linkedId, importSource = null }) {
  const { data: existing } = await supabase
    .from('documents')
    .select('id, bucket_path, linked_type, linked_id, doc_type')
    .eq('company_id', companyId)
    .eq('original_filename', file.name)
    .eq('size_bytes', file.size)
    .limit(10)

  const sameTarget = (existing ?? []).find(d => d.linked_type === linkedType && d.linked_id === linkedId)
  if (sameTarget) {
    if (docType && sameTarget.doc_type !== docType) {
      await supabase.from('documents').update({ doc_type: docType }).eq('id', sameTarget.id)
    }
    return { doc: sameTarget, reused: true, uploaded: false }
  }

  let bucketPath = (existing ?? [])[0]?.bucket_path ?? null
  let uploaded = false
  if (!bucketPath) {
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    bucketPath = `${companyId}/${importSource ?? mintBatchId()}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage.from('import-documents').upload(bucketPath, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })
    if (upErr) throw new Error(upErr.message)
    uploaded = true
  }

  const { data: doc, error: docErr } = await supabase.from('documents').insert({
    company_id: companyId,
    linked_type: linkedType,
    linked_id: linkedId,
    bucket_path: bucketPath,
    doc_type: docType || null,
    original_filename: file.name,
    content_type: file.type || null,
    size_bytes: file.size,
    import_source: importSource,
    uploaded_by: userId ?? null,
  }).select('id, bucket_path, linked_type, linked_id, doc_type').single()
  if (docErr) throw new Error(docErr.message)

  return { doc, reused: !uploaded, uploaded }
}
