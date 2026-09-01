import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import ImportWizardModal from '../import/ImportWizardModal'
import { downloadEstimateTemplate } from '../../utils/import/templates'
import { writeEstimateRows } from '../../utils/import/writeEstimates'
import {
  buildClientIndex, matchClient, lowestPositionColumn,
  normalizeEstimateStatus, parseMoney, parseDateFlexible, extraSheetRows, isPlaceholderSource,
} from '../../utils/import/importHelpers'

const TARGET_FIELDS = [
  { value: 'estimate_number', labelKey: 'estimates:import.fieldNumber' },
  { value: 'job_name', labelKey: 'estimates:import.fieldJobName' },
  { value: 'client', labelKey: 'estimates:import.fieldClient' },
  { value: 'estimate_date', labelKey: 'estimates:import.fieldDate' },
  { value: 'total', labelKey: 'estimates:import.fieldTotal' },
  { value: 'status', labelKey: 'estimates:import.fieldStatus' },
  { value: 'notes', labelKey: 'estimates:import.fieldNotes' },
]

function fmtMoney(v) {
  if (v == null) return ''
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function EstimateImportModal({ onClose, onImported, initialRows = null, afterImport = null }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()

  const [deps, setDeps] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const [{ data: estRows }, { data: projRows }, { data: clientRows }, { data: colRows }] = await Promise.all([
        supabase.from('estimates').select('id, estimate_number, import_source').eq('company_id', companyId),
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
      const estimateIndex = new Map()
      for (const est of estRows ?? []) {
        const key = (est.estimate_number ?? '').trim().toLowerCase()
        if (key && !estimateIndex.has(key)) estimateIndex.set(key, est)
      }
      const columns = colRows ?? []
      const completeCol = columns.find(c => c.column_key === 'complete') ?? lowestPositionColumn(columns)
      setDeps({
        estimateIndex,
        existingNumbers: new Set(estimateIndex.keys()),
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

    const number = (mapped.estimate_number || '').trim()
    if (!number) flags.push('missing_number')

    const jobName = (mapped.job_name || '').trim()
    if (!jobName) flags.push('missing_job')
    const projMatch = jobName && deps ? deps.projectIndex.get(jobName.toLowerCase()) ?? null : null
    if (jobName && deps && !projMatch) warnings.push('new_job')

    const clientText = (mapped.client || '').trim()
    const clientMatch = deps ? matchClient(deps.clientIndex, clientText) : null
    if (clientText && deps && !clientMatch) warnings.push('new_client')

    const estimateDate = parseDateFlexible(mapped.estimate_date)
    if (!estimateDate) flags.push('invalid_date')

    let total = parseMoney(mapped.total)
    if ((mapped.total || '').trim() && total == null) warnings.push('bad_total')
    if (total == null) total = 0

    const statusText = (mapped.status || '').trim()
    const explicitStatus = normalizeEstimateStatus(statusText)
    if (statusText && !explicitStatus) warnings.push('unknown_status')
    const status = explicitStatus ?? 'draft'

    return {
      estimate_number: number,
      job_name: jobName,
      client: clientText,
      notes: mapped.notes || '',
      _raw: mapped,
      _estimateDate: estimateDate,
      _total: total,
      _status: status,
      _projectId: projMatch?.id ?? null,
      _projectClientId: projMatch?.client_id ?? null,
      _clientId: clientMatch?.id ?? null,
      _flags: flags,
      _warnings: [...new Set(warnings)],
    }
  }

  const config = {
    ns: 'estimates:import',
    targetFields: TARGET_FIELDS,
    requiredTargets: ['estimate_number', 'job_name', 'estimate_date'],
    skipFlags: ['missing_number', 'missing_job', 'invalid_date'],
    modes: true,
    matchExisting: (row) => {
      const key = (row.estimate_number || '').trim().toLowerCase()
      if (!key) return null
      const match = deps?.estimateIndex.get(key)
      if (!match) return null
      return { id: match.id, isPlaceholder: isPlaceholderSource(match.import_source), existing: match }
    },
    dedupeKey: (row) => (row.estimate_number || '').trim().toLowerCase() || null,
    buildRow,
    editableReview: !!initialRows,
    reviewColumns: [
      { key: 'number', labelKey: 'estimates:import.colNumber', render: (row) => row.estimate_number || t('import:empty'), badges: ['missing_number', 'duplicate_in_file'], editKey: 'estimate_number' },
      { key: 'job', labelKey: 'estimates:import.colJob', render: (row) => row.job_name || t('import:empty'), badges: ['missing_job', 'new_job'], editKey: 'job_name' },
      { key: 'client', labelKey: 'estimates:import.colClient', render: (row) => row.client || '', badges: ['new_client'], editKey: 'client' },
      { key: 'date', labelKey: 'estimates:import.colDate', render: (row) => row._estimateDate || '', badges: ['invalid_date'], editKey: 'estimate_date' },
      { key: 'total', labelKey: 'estimates:import.colTotal', render: (row) => fmtMoney(row._total), badges: ['bad_total'], editKey: 'total' },
      { key: 'status', labelKey: 'estimates:import.colStatus', render: (row) => row._status, badges: ['unknown_status'] },
    ],
    flagLabels: {
      missing_number: 'estimates:import.badgeNoNumber',
      missing_job: 'estimates:import.badgeNoJob',
      invalid_date: 'estimates:import.badgeBadDate',
      bad_total: 'estimates:import.badgeBadTotal',
      duplicate_in_file: 'estimates:import.badgeDupFile',
      new_job: 'estimates:import.badgeNewJob',
      new_client: 'estimates:import.badgeNewClient',
      unknown_status: 'estimates:import.badgeUnknownStatus',
      exists: 'import:badgeExists',
      no_match: 'import:badgeNoMatch',
    },
    reasonLabels: {
      duplicate_number: 'estimates:import.reasonDuplicateNumber',
    },
    uploadPromptKey: 'uploadPrompt',
    mapHintKey: 'mapHint',
    importBtnKey: 'importBtn',
    importSuccessKey: 'importSuccess',
    skipReasonKey: 'skipReason',
    templateBuilder: downloadEstimateTemplate,
    ready: !!deps?.placeholderColumnId,
    afterImport,
    writeRows: ({ rows, batchId, mode, extra, onProgress }) => {
      const lineRows = extraSheetRows(extra, 'line items', 'lines', 'line_items')
      if (lineRows.length > 0) {
        const byNumber = new Map()
        for (const lr of lineRows) {
          const key = String(lr['estimate number'] ?? '').trim().toLowerCase()
          if (!key) continue
          if (!byNumber.has(key)) byNumber.set(key, [])
          byNumber.get(key).push({
            description: lr['description'] ?? '',
            category: lr['category'] ?? '',
            unit: lr['unit'] ?? '',
            quantity: lr['quantity'] ?? '',
            unit_rate: lr['unit rate'] ?? lr['rate'] ?? '',
          })
        }
        for (const row of rows) {
          const key = (row.estimate_number || '').trim().toLowerCase()
          if (key && byNumber.has(key) && !row._lines) row._lines = byNumber.get(key)
        }
      }
      return writeEstimateRows({
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
