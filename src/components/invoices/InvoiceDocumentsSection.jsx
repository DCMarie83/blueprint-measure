import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Modal, { ModalFooter } from '../ui/Modal'
import DocumentsSection from '../documents/DocumentsSection'
import InvoiceImportModal from './InvoiceImportModal'
import { mapExtractionToRow } from '../import/DocumentImportModal'
import { isExtractableInvoiceDoc, extractStoredDocument } from '../../utils/documents'
import { writeInvoiceRows, normalizeInvoiceLines } from '../../utils/import/writeInvoices'
import { mintBatchId, parseMoney } from '../../utils/import/importHelpers'

// The invoice page's Documents section, with the tools that uncouple merged
// invoices. Each invoice-type document the extractor can read gets a menu:
//   Re-import as its own invoice — runs the document importer on the STORED
//     file (no re-upload) and lands in the normal Review step, collision logic
//     included. On create the document row moves to the new invoice.
//   Replace this invoice's lines from this document — the G69 "revise" path
//     against THIS invoice, through the same writer, so the same refusals
//     (paid, void, below payments on file) and the same
//     invoice_edited_after_send log apply.
// Both are explicit, labeled, admin-only actions; nothing is sent to anyone.

const fmtUSD = (v) => `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (v) => Math.round(v * 100) / 100

export default function InvoiceDocumentsSection({ invoice, documents, fallbackClient = null, isAdmin = false, onUploaded, onChanged }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [menuRequest, setMenuRequest] = useState(null)
  // { mode: 'reimport' | 'replace', doc, phase: 'extracting' | 'ready' | 'failed', extraction }
  const [tool, setTool] = useState(null)

  const invoiceDocs = documents.filter(isExtractableInvoiceDoc)

  async function start(mode, doc) {
    setTool({ mode, doc, phase: 'extracting', extraction: null })
    try {
      const extraction = await extractStoredDocument(doc, 'invoice')
      setTool(prev => (prev && prev.doc.id === doc.id && prev.mode === mode ? { ...prev, phase: 'ready', extraction } : prev))
    } catch {
      setTool(prev => (prev && prev.doc.id === doc.id && prev.mode === mode ? { ...prev, phase: 'failed' } : prev))
    }
  }

  function close() { setTool(null) }

  // After the importer's writers run: the source document follows the record
  // the row produced (a new invoice, or the existing one a collision action
  // pointed at). Scoped by company as well as id.
  async function relinkSourceDocument(result, importedRows) {
    for (const row of importedRows) {
      if (!row._docId || !row._createdId) continue
      try {
        await supabase.from('documents')
          .update({ linked_type: 'invoice', linked_id: row._createdId })
          .eq('company_id', invoice.company_id)
          .eq('id', row._docId)
      } catch { /* linkage is best-effort, like the document importer */ }
    }
  }

  const docName = (doc) => doc.original_filename || doc.bucket_path.split('/').pop()

  function extraDocActions(doc) {
    if (!isExtractableInvoiceDoc(doc)) return []
    return [
      { key: 'reimport', label: t('invoices:docTools.reimport'), onClick: () => start('reimport', doc) },
      { key: 'replace', label: t('invoices:docTools.replace'), onClick: () => start('replace', doc) },
    ]
  }

  const notice = isAdmin && invoiceDocs.length > 1 ? (
    <>
      {t('invoices:docTools.multiNotice', { count: invoiceDocs.length })}{' '}
      <button
        type="button"
        onClick={() => setMenuRequest({ docId: invoiceDocs[0].id, nonce: Date.now() })}
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', fontSize: 13, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}
      >
        {t('invoices:docTools.showActions')}
      </button>
    </>
  ) : null

  const reimportRows = tool?.mode === 'reimport' && tool.phase === 'ready'
    ? mapExtractionToRow('invoices', tool.extraction, tool.doc.id).map(r => ({ ...r, _fallbackClient: fallbackClient }))
    : null

  return (
    <>
      <DocumentsSection
        documents={documents}
        uploadTarget={{ type: 'invoice', id: invoice.id }}
        onUploaded={onUploaded}
        onChanged={onChanged}
        notice={notice}
        extraDocActions={extraDocActions}
        menuRequest={menuRequest}
      />

      {tool && tool.phase !== 'ready' && (
        <Modal title={t(tool.mode === 'reimport' ? 'invoices:docTools.reimport' : 'invoices:docTools.replaceTitle')} onClose={close}>
          <p style={{ fontSize: 14, margin: 0, color: tool.phase === 'failed' ? 'var(--color-danger, #dc2626)' : 'var(--color-text)' }}>
            {tool.phase === 'failed'
              ? t('invoices:docTools.extractFailed')
              : t('invoices:docTools.extracting', { name: docName(tool.doc) })}
          </p>
          <ModalFooter>
            {tool.phase === 'failed' && (
              <button type="button" onClick={() => start(tool.mode, tool.doc)} style={{ padding: '8px 18px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {t('invoices:docTools.retry')}
              </button>
            )}
            <button type="button" onClick={close} style={{ padding: '8px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {t('common:action.cancel')}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {reimportRows && (
        <Modal title={t('invoices:docTools.reimport')} onClose={close}>
          <InvoiceImportModal
            onClose={close}
            onImported={onChanged}
            initialRows={reimportRows}
            afterImport={relinkSourceDocument}
          />
        </Modal>
      )}

      {tool?.mode === 'replace' && tool.phase === 'ready' && (
        <ReplaceLinesDialog
          invoice={invoice}
          docName={docName(tool.doc)}
          extraction={tool.extraction}
          userId={user?.id}
          onClose={close}
          onReplaced={onChanged}
        />
      )}
    </>
  )
}

// Confirm step for "Replace this invoice's lines from this document". Shows
// exactly what the writer will store (same line normalization), checks the
// lines against the printed total, and explains a refusal before the button
// can be pressed; the writer enforces the same refusals again at write time.
function ReplaceLinesDialog({ invoice, docName, extraction, userId, onClose, onReplaced }) {
  const { t } = useTranslation()
  const [ledger, setLedger] = useState(null) // payments on file; null = loading
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('invoice_payments').select('amount').eq('company_id', invoice.company_id).eq('invoice_id', invoice.id)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); return }
        setLedger(r2((data ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0)))
      })
    return () => { cancelled = true }
  }, [invoice.company_id, invoice.id])

  const rawLines = (extraction.lines ?? []).map(li => ({
    description: li.description ?? '',
    category: li.category ?? '',
    item_type: li.item_type ?? '',
    unit: li.unit ?? '',
    quantity: li.quantity,
    unit_rate: li.unit_rate,
    total: li.total,
  }))
  const lines = normalizeInvoiceLines(rawLines)
  const lineSum = r2(lines.reduce((s, li) => s + li.total, 0))
  const parsedTotal = parseMoney(String(extraction.header?.total ?? ''))
  const printedTotal = parsedTotal != null && parsedTotal > 0 ? parsedTotal : null
  const newTotal = printedTotal ?? lineSum
  const oldTotal = Number(invoice.total) || 0
  const mismatch = printedTotal != null && Math.round(printedTotal * 100) !== Math.round(lineSum * 100)

  let refusal = null
  if (invoice.status === 'paid') refusal = t('invoices:import.review.refusePaid')
  else if (invoice.status === 'void') refusal = t('invoices:import.review.refuseVoid')
  else if (lines.length === 0) refusal = t('invoices:docTools.noLines')
  else if (ledger != null && newTotal < ledger) refusal = t('invoices:import.review.refuseBelowPayments', { newTotal: fmtUSD(newTotal), paid: fmtUSD(ledger) })

  const canConfirm = !busy && !refusal && ledger != null

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await writeInvoiceRows({
        rows: [{
          invoice_number: invoice.invoice_number,
          _disposition: 'review',
          _existingId: invoice.id,
          _resolution: { action: 'revise' },
          _lines: rawLines,
          _total: printedTotal,
        }],
        batchId: mintBatchId(),
        companyId: invoice.company_id,
        userId,
        existingNumbers: new Set(),
        placeholderColumnId: null,
        docMode: true,
      })
      if (result.failed.length > 0) throw new Error(result.failed[0].error)
      await onReplaced?.()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const muted = { color: 'var(--color-text-muted)' }

  return (
    <Modal title={t('invoices:docTools.replaceTitle')} onClose={onClose}>
      <p style={{ fontSize: 14, margin: '0 0 12px' }}>
        {t('invoices:docTools.replaceIntro', { number: invoice.invoice_number, count: lines.length, name: docName })}
      </p>

      {lines.length > 0 && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '4px 12px', marginBottom: 12 }}>
          {lines.map((li, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderTop: i > 0 ? '1px solid var(--color-border)' : 'none' }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {li.category_name && <span style={muted}>{li.category_name} · </span>}
                {li.description}
                <span style={{ ...muted, display: 'block', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  {li.quantity} {li.unit} × {fmtUSD(li.unit_rate)}
                </span>
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{fmtUSD(li.total)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>{t('invoices:docTools.linesSum', { sum: fmtUSD(lineSum) })}{printedTotal != null && ` · ${t('invoices:docTools.printedTotal', { total: fmtUSD(printedTotal) })}`}</span>
        {mismatch && <span style={{ color: 'var(--color-warning, #d97706)', fontWeight: 600 }}>{t('invoices:docTools.mismatch', { sum: fmtUSD(lineSum), total: fmtUSD(printedTotal) })}</span>}
        {lines.length > 0 && <span style={{ fontWeight: 600 }}>{t('invoices:docTools.totalChange', { old: fmtUSD(oldTotal), new: fmtUSD(newTotal) })}</span>}
      </div>

      {(refusal || error) && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--color-danger-bg, #fee2e2)', border: '1px solid var(--color-danger-border, #fecaca)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>
          {error || refusal}
        </div>
      )}

      <ModalFooter>
        <button type="button" onClick={onClose} style={{ padding: '8px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {t('common:action.cancel')}
        </button>
        <button type="button" onClick={handleConfirm} disabled={!canConfirm} style={{ padding: '8px 18px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5 }}>
          {busy ? t('invoices:docTools.replacing') : t('invoices:docTools.replaceConfirm')}
        </button>
      </ModalFooter>
    </Modal>
  )
}
