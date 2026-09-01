import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { mintBatchId } from '../../utils/import/importHelpers'
import InvoiceImportModal from '../invoices/InvoiceImportModal'
import EstimateImportModal from '../estimates/EstimateImportModal'
import PricingImportModal from '../pricing/PricingImportModal'
import styles from './ImportWizardModal.module.css'

// "Import from documents": PDFs and scans upload to the private
// import-documents bucket (paths stored, never URLs), each gets a documents
// row (linked_type 'import_batch'), then the extract-documents edge function
// runs ONE call per document (at most 3 concurrent). Extracted rows skip
// Upload/Map and land in the normal wizard Review — editable, with
// low-confidence badges — and the same writers used by spreadsheet import run.
// After a successful write the source document's row is re-linked to the
// created invoice/estimate. Nothing here sends anything to anyone.

const MAX_FILES = 20
const MAX_FILE_BYTES = 15 * 1024 * 1024
const ACCEPT = '.pdf,.jpg,.jpeg,.png'
const CONCURRENCY = 3

const ENTITY_DEFAULT_KIND = { invoices: 'invoice', estimates: 'quote', pricing: 'price_list' }

async function runPool(items, worker, concurrency) {
  const queue = [...items.entries()]
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const [idx, item] = queue.shift()
      await worker(item, idx)
    }
  })
  await Promise.all(runners)
}

function lowConfidenceFields(confidence) {
  return Object.entries(confidence ?? {})
    .filter(([, v]) => v === 'low')
    .map(([k]) => k)
}

function mapExtractionToRow(entity, extraction, docId) {
  const h = extraction.header ?? {}
  const lines = (extraction.lines ?? []).map(li => ({
    description: li.description ?? '',
    category: li.category ?? '',
    item_type: li.item_type ?? '',
    unit: li.unit ?? '',
    quantity: li.quantity != null ? String(li.quantity) : '',
    unit_rate: li.unit_rate != null ? String(li.unit_rate) : '',
    total: li.total != null ? String(li.total) : '',
  }))
  const low = lowConfidenceFields(extraction.confidence)
  const str = (v) => (v == null ? '' : String(v))

  if (entity === 'invoices') {
    return [{
      invoice_number: str(h.number),
      job_name: str(h.job_name || h.job_address),
      client: str(h.bill_to_name),
      invoice_date: str(h.date),
      total: str(h.total),
      amount_paid: str(h.amount_paid),
      paid_date: str(h.paid_date),
      payment_method: str(h.payment_method),
      status: str(h.status_hint),
      notes: '',
      _lines: lines,
      _docId: docId,
      _lowConfidence: low,
    }]
  }
  if (entity === 'estimates') {
    return [{
      estimate_number: str(h.number),
      job_name: str(h.job_name || h.job_address),
      client: str(h.bill_to_name),
      estimate_date: str(h.date),
      total: str(h.total),
      status: str(h.status_hint),
      notes: '',
      _lines: lines,
      _docId: docId,
      _lowConfidence: low,
    }]
  }
  // pricing: every extracted line becomes a library row
  return lines
    .filter(li => li.description)
    .map(li => ({
      name: li.description,
      unit: li.unit,
      rate: li.unit_rate,
      category: li.category,
      description: '',
      _docId: docId,
      _lowConfidence: low,
    }))
}

export default function DocumentImportModal({ entity, onClose, onImported }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()

  const [files, setFiles] = useState([])
  const [kind, setKind] = useState(ENTITY_DEFAULT_KIND[entity] ?? 'auto')
  const [phase, setPhase] = useState('pick') // 'pick' | 'working' | 'review'
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [fileErrors, setFileErrors] = useState([])
  const [rows, setRows] = useState(null)
  const [docMeta, setDocMeta] = useState(new Map()) // docId → { docType }

  function handleFileSelect(e) {
    const picked = Array.from(e.target.files ?? [])
    const errs = []
    const ok = []
    for (const f of picked) {
      const ext = f.name.split('.').pop()?.toLowerCase()
      if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
        errs.push(t('import:docs.badType', { name: f.name }))
      } else if (f.size > MAX_FILE_BYTES) {
        errs.push(t('import:docs.tooLarge', { name: f.name }))
      } else {
        ok.push(f)
      }
    }
    if (ok.length > MAX_FILES) {
      errs.push(t('import:docs.tooMany', { max: MAX_FILES }))
    }
    setFileErrors(errs)
    setFiles(ok.slice(0, MAX_FILES))
  }

  async function handleExtract() {
    if (files.length === 0 || !companyId) return
    setPhase('working')
    setFileErrors([])
    const batchId = mintBatchId()
    const errs = []
    const collected = []
    const meta = new Map()
    let done = 0
    setProgress({ current: 0, total: files.length })

    await runPool(files, async (file) => {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const path = `${companyId}/${batchId}/${Date.now()}-${safeName}`

        const { error: upErr } = await supabase.storage.from('import-documents').upload(path, file, {
          cacheControl: '3600',
          contentType: file.type || undefined,
          upsert: false,
        })
        if (upErr) throw new Error(upErr.message)

        const { data: doc, error: docErr } = await supabase.from('documents').insert({
          company_id: companyId,
          linked_type: 'import_batch',
          linked_id: null,
          bucket_path: path,
          doc_type: kind === 'auto' ? null : kind,
          original_filename: file.name,
          content_type: file.type || null,
          size_bytes: file.size,
          import_source: batchId,
          uploaded_by: user?.id ?? null,
        }).select('id').single()
        if (docErr) throw new Error(docErr.message)

        const { data, error: fnErr } = await supabase.functions.invoke('extract-documents', {
          body: { path, kind },
        })
        if (fnErr) throw new Error(fnErr.message)
        if (!data || data.ai_failed || !data.rows) {
          throw new Error(t('import:docs.extractFailed'))
        }

        meta.set(doc.id, { docType: data.doc_type })
        collected.push(...mapExtractionToRow(entity, data.rows, doc.id))
      } catch (err) {
        errs.push(`${file.name} — ${err.message || String(err)}`)
      } finally {
        done += 1
        setProgress({ current: done, total: files.length })
      }
    }, CONCURRENCY)

    setFileErrors(errs)
    setDocMeta(meta)
    if (collected.length === 0) {
      setPhase('pick')
      if (errs.length === 0) setFileErrors([t('import:docs.nothingExtracted')])
      return
    }
    setRows(collected)
    setPhase('review')
  }

  // After the writers run, re-link each source document to the record it
  // produced (writers stamp row._createdId) and finalize its doc_type.
  async function afterImport(result, importedRows) {
    const linkedType = entity === 'invoices' ? 'invoice' : entity === 'estimates' ? 'estimate' : null
    for (const row of importedRows) {
      if (!row._docId || !row._createdId) continue
      const patch = { doc_type: docMeta.get(row._docId)?.docType ?? (kind === 'auto' ? null : kind) }
      if (linkedType) {
        patch.linked_type = linkedType
        patch.linked_id = row._createdId
      }
      try {
        await supabase.from('documents').update(patch).eq('id', row._docId)
      } catch { /* linkage is best-effort */ }
    }
  }

  if (phase === 'review' && rows) {
    const shared = { onClose, onImported, initialRows: rows, afterImport }
    if (entity === 'invoices') return <InvoiceImportModal {...shared} />
    if (entity === 'estimates') return <EstimateImportModal {...shared} />
    return <PricingImportModal {...shared} />
  }

  return (
    <div>
      {phase === 'pick' && (
        <div>
          <p className={styles.info}>{t('import:docs.prompt')}</p>
          <input type="file" accept={ACCEPT} multiple className={styles.fileInput} onChange={handleFileSelect} />
          {files.length > 0 && <p className={styles.info}>{t('import:docs.filesSelected', { count: files.length })}</p>}

          <div style={{ margin: '12px 0' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('import:docs.kindLabel')}
            </label>
            <div className={styles.typeToggle}>
              {['auto', 'invoice', 'quote', 'price_list'].map(k => (
                <button key={k} type="button" className={`${styles.typeBtn} ${kind === k ? styles.typeBtnActive : ''}`} onClick={() => setKind(k)}>
                  {t(`import:docs.kind.${k}`)}
                </button>
              ))}
            </div>
          </div>

          {fileErrors.map((e, i) => <div key={i} className={styles.error}>{e}</div>)}

          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>{t('common:action.cancel')}</button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={files.length === 0} onClick={handleExtract}>
              {t('import:docs.extractBtn', { count: files.length })}
            </button>
          </div>
        </div>
      )}

      {phase === 'working' && (
        <div>
          <p className={styles.info}>{t('import:docs.extracting', { current: Math.min(progress.current + 1, progress.total), total: progress.total })}</p>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }} />
          </div>
          {fileErrors.map((e, i) => <div key={i} className={styles.error}>{e}</div>)}
        </div>
      )}
    </div>
  )
}
