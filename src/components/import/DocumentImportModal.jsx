import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { mintBatchId } from '../../utils/import/importHelpers'
import { DOC_TYPES, ATTACH_ACCEPT, ATTACH_MAX_BYTES, guessDocType, validateAttachFile, uploadDocument } from '../../utils/documents'
import InvoiceImportModal from '../invoices/InvoiceImportModal'
import EstimateImportModal from '../estimates/EstimateImportModal'
import PricingImportModal from '../pricing/PricingImportModal'
import styles from './ImportWizardModal.module.css'

// Document Import wizard, two modes:
//
// EXTRACT (original): PDFs and scans upload to the private import-documents
// bucket (paths stored, never URLs), each gets a documents row (linked_type
// 'import_batch'), then the extract-documents edge function runs ONE call per
// document (at most 3 concurrent). Extracted rows land in the normal wizard
// Review and the same writers used by spreadsheet import run. After a
// successful write the source document's row is re-linked.
//
// ATTACH (G54): no extraction, no AI call, no meter usage. Per file the user
// picks a doc_type and a record (job / client / invoice / estimate,
// searchable); the review table (file, record, type) commits documents rows
// linked to the chosen records. G52 dedupe: same company + filename + size
// reuses the stored object instead of re-uploading. Attach-only: record
// fields are never touched. Nothing here sends anything to anyone.

const MAX_FILES = 20
const EXTRACT_MAX_BYTES = 15 * 1024 * 1024
const EXTRACT_ACCEPT = '.pdf,.jpg,.jpeg,.png'
const CONCURRENCY = 3

const ENTITY_DEFAULT_KIND = { invoices: 'invoice', estimates: 'quote', pricing: 'price_list' }
const RECORD_TYPES = ['project', 'client', 'invoice', 'estimate']

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
    // Money boundary: total is the document's full gross total ONLY.
    // header.balance_due is never mapped into total; the printed payments
    // figure backfills amount_paid when the doc lacks an explicit one.
    return [{
      invoice_number: str(h.number),
      job_name: str(h.job_name || h.job_address),
      client: str(h.bill_to_name),
      invoice_date: str(h.date),
      total: str(h.total),
      amount_paid: str(h.amount_paid ?? h.payments_printed),
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

  const [wizardMode, setWizardMode] = useState('extract') // 'extract' | 'attach'
  const [files, setFiles] = useState([])
  const [kind, setKind] = useState(ENTITY_DEFAULT_KIND[entity] ?? 'auto')
  const [phase, setPhase] = useState('pick') // 'pick' | 'working' | 'review' | 'assign' | 'attaching' | 'attached'
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [fileErrors, setFileErrors] = useState([])
  const [rows, setRows] = useState(null)
  const [docMeta, setDocMeta] = useState(new Map()) // docId → { docType }

  // Attach mode state
  const [assignments, setAssignments] = useState([]) // per file: { file, docType, recordType, recordId, search }
  const [records, setRecords] = useState(null) // { project: [{id,label}], client, invoice, estimate }
  const [attachResult, setAttachResult] = useState(null)

  // Record options for the attach-mode picker, fetched once.
  useEffect(() => {
    if (wizardMode !== 'attach' || records || !companyId) return
    let cancelled = false
    ;(async () => {
      const [{ data: projects }, { data: clients }, { data: invoices }, { data: estimates }] = await Promise.all([
        supabase.from('projects').select('id, name').eq('company_id', companyId).is('deleted_at', null).order('name'),
        supabase.from('clients').select('id, display_name').eq('company_id', companyId).order('display_name'),
        supabase.from('invoices').select('id, invoice_number').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('estimates').select('id, estimate_number, title').eq('company_id', companyId).order('created_at', { ascending: false }),
      ])
      if (cancelled) return
      setRecords({
        project: (projects ?? []).map(p => ({ id: p.id, label: p.name })),
        client: (clients ?? []).map(c => ({ id: c.id, label: c.display_name })),
        invoice: (invoices ?? []).map(i => ({ id: i.id, label: i.invoice_number })),
        estimate: (estimates ?? []).map(e => ({ id: e.id, label: e.title || e.estimate_number })),
      })
    })()
    return () => { cancelled = true }
  }, [wizardMode, records, companyId])

  function handleFileSelect(e) {
    const picked = Array.from(e.target.files ?? [])
    const errs = []
    const ok = []
    const maxBytes = wizardMode === 'attach' ? ATTACH_MAX_BYTES : EXTRACT_MAX_BYTES
    for (const f of picked) {
      const ext = f.name.split('.').pop()?.toLowerCase()
      const typeOk = wizardMode === 'attach'
        ? validateAttachFile(f) !== 'type'
        : ['pdf', 'jpg', 'jpeg', 'png'].includes(ext)
      if (!typeOk) {
        errs.push(t('import:docs.badType', { name: f.name }))
      } else if (f.size > maxBytes) {
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

  // ── EXTRACT mode (unchanged flow) ─────────────────────────

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

  // ── ATTACH mode ───────────────────────────────────────────

  function startAssign() {
    setAssignments(files.map(file => ({
      file,
      docType: guessDocType(file.name),
      recordType: 'project',
      recordId: '',
      search: '',
    })))
    setPhase('assign')
  }

  function updateAssignment(idx, patch) {
    setAssignments(prev => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)))
  }

  const allAssigned = assignments.length > 0 && assignments.every(a => a.recordId)

  async function handleAttach() {
    if (!allAssigned || !companyId) return
    setPhase('attaching')
    const batchId = mintBatchId()
    const attached = []
    const reused = []
    const failed = []
    let done = 0
    setProgress({ current: 0, total: assignments.length })

    for (const a of assignments) {
      try {
        const res = await uploadDocument({
          companyId,
          userId: user?.id,
          file: a.file,
          docType: a.docType,
          linkedType: a.recordType,
          linkedId: a.recordId,
          importSource: batchId,
        })
        ;(res.reused ? reused : attached).push(a.file.name)
      } catch (err) {
        failed.push(`${a.file.name} — ${err.message || String(err)}`)
      } finally {
        done += 1
        setProgress({ current: done, total: assignments.length })
      }
    }

    setAttachResult({ attached, reused, failed })
    setPhase('attached')
    onImported?.()
  }

  // ── Render ────────────────────────────────────────────────

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
          {/* Mode toggle: extract vs attach-only */}
          <div style={{ marginBottom: 12 }}>
            <div className={styles.typeToggle}>
              {['extract', 'attach'].map(m => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.typeBtn} ${wizardMode === m ? styles.typeBtnActive : ''}`}
                  onClick={() => { setWizardMode(m); setFiles([]); setFileErrors([]) }}
                >
                  {t(`import:docs.mode.${m}`)}
                </button>
              ))}
            </div>
          </div>

          <p className={styles.info}>{t(wizardMode === 'attach' ? 'import:docs.attachPrompt' : 'import:docs.prompt')}</p>
          <input
            key={wizardMode}
            type="file"
            accept={wizardMode === 'attach' ? ATTACH_ACCEPT : EXTRACT_ACCEPT}
            multiple
            className={styles.fileInput}
            onChange={handleFileSelect}
          />
          {files.length > 0 && <p className={styles.info}>{t('import:docs.filesSelected', { count: files.length })}</p>}

          {wizardMode === 'extract' && (
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
          )}

          {fileErrors.map((e, i) => <div key={i} className={styles.error}>{e}</div>)}

          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>{t('common:action.cancel')}</button>
            {wizardMode === 'attach' ? (
              <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={files.length === 0} onClick={startAssign}>
                {t('common:action.next')}
              </button>
            ) : (
              <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={files.length === 0} onClick={handleExtract}>
                {t('import:docs.extractBtn', { count: files.length })}
              </button>
            )}
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

      {/* Attach mode: file → record → type review before commit */}
      {phase === 'assign' && (
        <div>
          <p className={styles.info}>{t('import:docs.assignPrompt')}</p>
          <div className={styles.previewWrap} style={{ maxHeight: 340 }}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th>{t('import:docs.colFile')}</th>
                  <th>{t('import:docs.colRecord')}</th>
                  <th>{t('import:docs.colType')}</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a, idx) => {
                  const options = records?.[a.recordType] ?? []
                  const query = a.search.trim().toLowerCase()
                  const filtered = query
                    ? options.filter(o => (o.label ?? '').toLowerCase().includes(query))
                    : options
                  return (
                    <tr key={idx}>
                      <td style={{ maxWidth: 180 }}>{a.file.name}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          <select
                            className={styles.mappingSelect}
                            style={{ minWidth: 90, flex: 'none' }}
                            value={a.recordType}
                            onChange={e => updateAssignment(idx, { recordType: e.target.value, recordId: '', search: '' })}
                          >
                            {RECORD_TYPES.map(rt => <option key={rt} value={rt}>{t(`import:docs.recordType.${rt}`)}</option>)}
                          </select>
                          <input
                            className={styles.mappingSelect}
                            style={{ minWidth: 90, flex: 'none' }}
                            placeholder={t('import:docs.searchPlaceholder')}
                            value={a.search}
                            onChange={e => updateAssignment(idx, { search: e.target.value })}
                          />
                          <select
                            className={styles.mappingSelect}
                            style={{ minWidth: 140 }}
                            value={a.recordId}
                            onChange={e => updateAssignment(idx, { recordId: e.target.value })}
                          >
                            <option value="">{t('import:docs.pickRecord')}</option>
                            {filtered.slice(0, 200).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                        </div>
                      </td>
                      <td>
                        <select
                          className={styles.mappingSelect}
                          value={a.docType}
                          onChange={e => updateAssignment(idx, { docType: e.target.value })}
                        >
                          {DOC_TYPES.map(dt => <option key={dt} value={dt}>{t(`shared:documents.type.${dt}`)}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setPhase('pick')}>{t('common:action.back')}</button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!allAssigned} onClick={handleAttach}>
              {t('import:docs.attachBtn', { count: assignments.length })}
            </button>
          </div>
        </div>
      )}

      {phase === 'attaching' && (
        <div>
          <p className={styles.info}>{t('import:docs.attaching', { current: Math.min(progress.current + 1, progress.total), total: progress.total })}</p>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }} />
          </div>
        </div>
      )}

      {phase === 'attached' && attachResult && (
        <div>
          <div className={styles.success}>{t('import:docs.attachSuccess', { count: attachResult.attached.length })}</div>
          {attachResult.reused.length > 0 && (
            <div className={styles.resultList}>
              <strong>{t('import:docs.reusedCount', { count: attachResult.reused.length })}</strong>
              {attachResult.reused.slice(0, 10).map((name, i) => <div key={i} className={styles.resultItem}>{name}</div>)}
            </div>
          )}
          {attachResult.failed.length > 0 && (
            <div className={styles.resultList}>
              <strong>{t('import:failedCount', { count: attachResult.failed.length })}</strong>
              {attachResult.failed.slice(0, 5).map((f, i) => <div key={i} className={styles.resultItem}>{f}</div>)}
            </div>
          )}
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>{t('import:done')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
