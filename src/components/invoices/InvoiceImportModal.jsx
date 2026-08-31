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
  parseMoney, parseDateFlexible,
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

export default function InvoiceImportModal({ onClose, onImported }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()

  // Company lookups fetched ONCE for the whole run: existing invoice numbers
  // (dedupe), projects (job matching), clients (client matching) and the
  // kanban 'Complete' column for auto-created placeholder jobs.
  const [deps, setDeps] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const [{ data: invRows }, { data: projRows }, { data: clientRows }, { data: colRows }] = await Promise.all([
        supabase.from('invoices').select('invoice_number').eq('company_id', companyId),
        supabase.from('projects').select('id, name, client_id').eq('company_id', companyId).is('deleted_at', null),
        supabase.from('clients').select('id, display_name, business_name, primary_email').eq('company_id', companyId),
        supabase.from('kanban_columns').select('*').eq('company_id', companyId).order('position', { ascending: true }),
      ])
      if (cancelled) return
      const projectIndex = new Map()
      for (const p of projRows ?? []) {
        const key = (p.name ?? '').trim().toLowerCase()
        if (key && !projectIndex.has(key)) projectIndex.set(key, p)
      }
      const columns = colRows ?? []
      const completeCol = columns.find(c => c.column_key === 'complete') ?? lowestPositionColumn(columns)
      setDeps({
        existingNumbers: new Set((invRows ?? []).map(r => (r.invoice_number ?? '').trim().toLowerCase()).filter(Boolean)),
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
    if (!number) flags.push('missing_number')
    else if (deps?.existingNumbers.has(number.toLowerCase())) flags.push('duplicate_number')

    const jobName = (mapped.job_name || '').trim()
    if (!jobName) flags.push('missing_job')
    const projMatch = jobName && deps ? deps.projectIndex.get(jobName.toLowerCase()) ?? null : null
    if (jobName && deps && !projMatch) warnings.push('new_job')

    const clientText = (mapped.client || '').trim()
    const clientMatch = deps ? matchClient(deps.clientIndex, clientText) : null
    if (clientText && deps && !clientMatch) warnings.push('new_client')

    const invoiceDate = parseDateFlexible(mapped.invoice_date)
    if (!invoiceDate) flags.push('invalid_date')

    // HARD RULE: Total must parse to a number > 0, or the row fails review.
    const total = parseMoney(mapped.total)
    if (total == null || total <= 0) flags.push('invalid_total')

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
    // Explicit valid status wins; otherwise derive from amounts. Never derived
    // when Total is invalid — the row is already failed above.
    const status = explicitStatus ?? deriveInvoiceStatus(total ?? 0, amountPaid)

    return {
      invoice_number: number,
      job_name: jobName,
      client: clientText,
      notes: mapped.notes || '',
      _invoiceDate: invoiceDate,
      _total: total,
      _amountPaid: amountPaid,
      _paidDate: paidDate,
      _status: status,
      _method: method,
      _methodOriginal: original,
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
    requiredTargets: ['invoice_number', 'job_name', 'invoice_date', 'total'],
    skipFlags: ['missing_number', 'missing_job', 'invalid_date', 'invalid_total', 'duplicate_number'],
    dedupeKey: (row) => row.invoice_number.toLowerCase() || null,
    buildRow,
    reviewColumns: [
      { key: 'number', labelKey: 'invoices:import.colNumber', render: (row) => row.invoice_number || t('import:empty'), badges: ['missing_number', 'duplicate_number', 'duplicate_in_file'] },
      { key: 'job', labelKey: 'invoices:import.colJob', render: (row) => row.job_name || t('import:empty'), badges: ['missing_job', 'new_job'] },
      { key: 'client', labelKey: 'invoices:import.colClient', render: (row) => row.client || '', badges: ['new_client'] },
      { key: 'date', labelKey: 'invoices:import.colDate', render: (row) => row._invoiceDate || '', badges: ['invalid_date', 'invalid_paid_date'] },
      { key: 'total', labelKey: 'invoices:import.colTotal', render: (row) => fmtMoney(row._total), badges: ['invalid_total'] },
      { key: 'paid', labelKey: 'invoices:import.colPaid', render: (row) => fmtMoney(row._amountPaid), badges: ['invalid_paid'] },
      { key: 'status', labelKey: 'invoices:import.colStatus', render: (row) => row._status, badges: ['unknown_status', 'other_method'] },
    ],
    flagLabels: {
      missing_number: 'invoices:import.badgeNoNumber',
      missing_job: 'invoices:import.badgeNoJob',
      invalid_date: 'invoices:import.badgeBadDate',
      invalid_paid_date: 'invoices:import.badgeBadPaidDate',
      invalid_total: 'invoices:import.badgeBadTotal',
      invalid_paid: 'invoices:import.badgeBadPaid',
      duplicate_number: 'invoices:import.badgeDupDb',
      duplicate_in_file: 'invoices:import.badgeDupFile',
      new_job: 'invoices:import.badgeNewJob',
      new_client: 'invoices:import.badgeNewClient',
      unknown_status: 'invoices:import.badgeUnknownStatus',
      other_method: 'invoices:import.badgeOtherMethod',
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
    writeRows: ({ rows, batchId, onProgress }) => writeInvoiceRows({
      rows,
      batchId,
      onProgress,
      companyId,
      userId: user.id,
      existingNumbers: deps.existingNumbers,
      placeholderColumnId: deps.placeholderColumnId,
    }),
  }

  return <ImportWizardModal config={config} onClose={onClose} onImported={onImported} />
}
