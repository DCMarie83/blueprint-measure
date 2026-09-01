import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import ImportWizardModal from '../import/ImportWizardModal'
import { downloadInvoiceTemplate } from '../../utils/import/templates'
import { writeInvoiceRows } from '../../utils/import/writeInvoices'
import {
  buildClientIndex, matchClient, lowestPositionColumn,
  normalizeInvoiceStatus, deriveInvoiceStatus, normalizePaymentMethod,
  parseMoney, parseDateFlexible, dueDateFromTerms, extraSheetRows, isPlaceholderSource,
} from '../../utils/import/importHelpers'

const TARGET_FIELDS = [
  { value: 'invoice_number', labelKey: 'invoices:import.fieldNumber' },
  { value: 'job_name', labelKey: 'invoices:import.fieldJobName' },
  { value: 'client', labelKey: 'invoices:import.fieldClient' },
  { value: 'invoice_date', labelKey: 'invoices:import.fieldDate' },
  { value: 'total', labelKey: 'invoices:import.fieldTotal' },
  { value: 'amount_paid', labelKey: 'invoices:import.fieldAmountPaid' },
  { value: 'paid_date', labelKey: 'invoices:import.fieldPaidDate' },
  { value: 'payment_method', labelKey: 'invoices:import.fieldPaymentMethod' },
  { value: 'status', labelKey: 'invoices:import.fieldStatus' },
  { value: 'notes', labelKey: 'invoices:import.fieldNotes' },
]

function fmtMoney(v) {
  if (v == null) return ''
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function InvoiceImportModal({ onClose, onImported, initialRows = null, afterImport = null }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()

  // Company lookups fetched ONCE for the whole run: existing invoices
  // (upsert matching + dedupe), projects (job matching), clients (client
  // matching + billing terms for due dates) and the kanban 'Complete' column
  // for auto-created placeholder jobs.
  const [deps, setDeps] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const [{ data: invRows }, { data: projRows }, { data: clientRows }, { data: colRows }] = await Promise.all([
        supabase.from('invoices').select('id, invoice_number, import_source').eq('company_id', companyId),
        supabase.from('projects').select('id, name, client_id').eq('company_id', companyId).is('deleted_at', null),
        supabase.from('clients').select('id, display_name, business_name, primary_email, billing_terms').eq('company_id', companyId),
        supabase.from('kanban_columns').select('*').eq('company_id', companyId).order('position', { ascending: true }),
      ])
      if (cancelled) return
      const projectIndex = new Map()
      for (const p of projRows ?? []) {
        const key = (p.name ?? '').trim().toLowerCase()
        if (key && !projectIndex.has(key)) projectIndex.set(key, p)
      }
      const invoiceIndex = new Map()
      for (const inv of invRows ?? []) {
        const key = (inv.invoice_number ?? '').trim().toLowerCase()
        if (key && !invoiceIndex.has(key)) invoiceIndex.set(key, inv)
      }
      const columns = colRows ?? []
      const completeCol = columns.find(c => c.column_key === 'complete') ?? lowestPositionColumn(columns)
      setDeps({
        invoiceIndex,
        existingNumbers: new Set(invoiceIndex.keys()),
        projectIndex,
        clientIndex: buildClientIndex(clientRows ?? []),
        placeholderColumnId: completeCol?.id ?? null,
      })
    })()
    return () => { cancelled = true }
  }, [companyId])

  function buildRow(mapped) {
    const flags = []
    const warnings = []

    const number = (mapped.invoice_number || '').trim()
    if (!number) warnings.push('missing_number') // D4: placeholder minted at write

    const jobName = (mapped.job_name || '').trim()
    if (!jobName) flags.push('missing_job')
    const projMatch = jobName && deps ? deps.projectIndex.get(jobName.toLowerCase()) ?? null : null
    if (jobName && deps && !projMatch) warnings.push('new_job')

    const clientText = (mapped.client || '').trim()
    const clientMatch = deps ? matchClient(deps.clientIndex, clientText) : null
    if (clientText && deps && !clientMatch) warnings.push('new_client')

    const invoiceDate = parseDateFlexible(mapped.invoice_date)
    if (!invoiceDate) flags.push('invalid_date')

    // D4: a missing/unparseable total no longer fails the row — it imports as a
    // draft with total 0 and the status is never derived.
    const totalRaw = (mapped.total || '').trim()
    let total = parseMoney(mapped.total)
    if (total == null || total <= 0) {
      total = null
      warnings.push(totalRaw ? 'bad_total' : 'no_total')
    }

    let amountPaid = parseMoney(mapped.amount_paid)
    if ((mapped.amount_paid || '').trim() && amountPaid == null) warnings.push('invalid_paid')
    amountPaid = amountPaid != null && amountPaid > 0 ? amountPaid : 0

    const paidDate = parseDateFlexible(mapped.paid_date)
    if ((mapped.paid_date || '').trim() && !paidDate) warnings.push('invalid_paid_date')

    const { method, original } = normalizePaymentMethod(mapped.payment_method)
    if (original) warnings.push('other_method')

    const statusText = (mapped.status || '').trim()
    const explicitStatus = normalizeInvoiceStatus(statusText)
    if (statusText && !explicitStatus) warnings.push('unknown_status')
    const status = total == null
      ? 'draft'
      : (explicitStatus ?? deriveInvoiceStatus(total, amountPaid))

    // Due date: invoice date + the matched client's billing terms; no client or
    // no usable terms falls back to invoice date + 30.
    const dueDate = dueDateFromTerms(invoiceDate, clientMatch?.billing_terms ?? null)

    return {
      invoice_number: number,
      job_name: jobName,
      client: clientText,
      notes: mapped.notes || '',
      _raw: mapped,
      _invoiceDate: invoiceDate,
      _total: total,
      _amountPaid: amountPaid,
      _paidDate: paidDate,
      _status: status,
      _method: method,
      _methodOriginal: original,
      _dueDate: dueDate,
      _projectId: projMatch?.id ?? null,
      _projectClientId: projMatch?.client_id ?? null,
      _clientId: clientMatch?.id ?? null,
      _flags: flags,
      _warnings: [...new Set(warnings)],
    }
  }

  const config = {
    ns: 'invoices:import',
    targetFields: TARGET_FIELDS,
    requiredTargets: ['job_name', 'invoice_date'],
    skipFlags: ['missing_job', 'invalid_date'],
    modes: true,
    matchExisting: (row) => {
      const key = (row.invoice_number || '').trim().toLowerCase()
      if (!key) return null
      const match = deps?.invoiceIndex.get(key)
      if (!match) return null
      return { id: match.id, isPlaceholder: isPlaceholderSource(match.import_source), existing: match }
    },
    dedupeKey: (row) => (row.invoice_number || '').trim().toLowerCase() || null,
    buildRow,
    editableReview: !!initialRows,
    reviewColumns: [
      { key: 'number', labelKey: 'invoices:import.colNumber', render: (row) => row.invoice_number || t('import:empty'), badges: ['missing_number', 'duplicate_in_file'], editKey: 'invoice_number' },
      { key: 'job', labelKey: 'invoices:import.colJob', render: (row) => row.job_name || t('import:empty'), badges: ['missing_job', 'new_job'], editKey: 'job_name' },
      { key: 'client', labelKey: 'invoices:import.colClient', render: (row) => row.client || '', badges: ['new_client'], editKey: 'client' },
      { key: 'date', labelKey: 'invoices:import.colDate', render: (row) => row._invoiceDate || '', badges: ['invalid_date', 'invalid_paid_date'], editKey: 'invoice_date' },
      { key: 'total', labelKey: 'invoices:import.colTotal', render: (row) => fmtMoney(row._total), badges: ['no_total', 'bad_total'], editKey: 'total' },
      { key: 'paid', labelKey: 'invoices:import.colPaid', render: (row) => fmtMoney(row._amountPaid), badges: ['invalid_paid'], editKey: 'amount_paid' },
      { key: 'status', labelKey: 'invoices:import.colStatus', render: (row) => row._status, badges: ['unknown_status', 'other_method'] },
    ],
    flagLabels: {
      missing_number: 'invoices:import.badgeNoNumber',
      missing_job: 'invoices:import.badgeNoJob',
      invalid_date: 'invoices:import.badgeBadDate',
      invalid_paid_date: 'invoices:import.badgeBadPaidDate',
      no_total: 'invoices:import.badgeNoTotal',
      bad_total: 'invoices:import.badgeBadTotal',
      invalid_paid: 'invoices:import.badgeBadPaid',
      duplicate_in_file: 'invoices:import.badgeDupFile',
      new_job: 'invoices:import.badgeNewJob',
      new_client: 'invoices:import.badgeNewClient',
      unknown_status: 'invoices:import.badgeUnknownStatus',
      other_method: 'invoices:import.badgeOtherMethod',
      exists: 'import:badgeExists',
      no_match: 'import:badgeNoMatch',
    },
    reasonLabels: {
      duplicate_number: 'invoices:import.reasonDuplicateNumber',
    },
    uploadPromptKey: 'uploadPrompt',
    mapHintKey: 'mapHint',
    importBtnKey: 'importBtn',
    importSuccessKey: 'importSuccess',
    skipReasonKey: 'skipReason',
    templateBuilder: downloadInvoiceTemplate,
    ready: !!deps?.placeholderColumnId,
    afterImport,
    writeRows: ({ rows, batchId, mode, extra, onProgress }) => {
      // Optional "Line Items" sheet: attach lines to their invoice by number.
      const lineRows = extraSheetRows(extra, 'line items', 'lines', 'line_items')
      if (lineRows.length > 0) {
        const byNumber = new Map()
        for (const lr of lineRows) {
          const key = String(lr['invoice number'] ?? '').trim().toLowerCase()
          if (!key) continue
          if (!byNumber.has(key)) byNumber.set(key, [])
          byNumber.get(key).push({
            description: lr['description'] ?? '',
            category: lr['category'] ?? '',
            item_type: lr['item type'] ?? '',
            unit: lr['unit'] ?? '',
            quantity: lr['quantity'] ?? '',
            unit_rate: lr['unit rate'] ?? lr['rate'] ?? '',
          })
        }
        for (const row of rows) {
          const key = (row.invoice_number || '').trim().toLowerCase()
          if (key && byNumber.has(key) && !row._lines) row._lines = byNumber.get(key)
        }
      }
      return writeInvoiceRows({
        rows,
        batchId,
        mode,
        onProgress,
        companyId,
        userId: user.id,
        existingNumbers: deps.existingNumbers,
        placeholderColumnId: deps.placeholderColumnId,
      })
    },
  }

  return <ImportWizardModal config={config} onClose={onClose} onImported={onImported} initialRows={initialRows} />
}
