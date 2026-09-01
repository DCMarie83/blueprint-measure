import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import ImportWizardModal from '../import/ImportWizardModal'
import { downloadChangeOrderTemplate } from '../../utils/import/templates'
import { writeChangeOrderRows } from '../../utils/import/writeChangeOrders'
import {
  buildClientIndex, matchClient, lowestPositionColumn,
  normalizeChangeOrderStatus, parseMoney, parseDateFlexible, isPlaceholderSource,
} from '../../utils/import/importHelpers'

const TARGET_FIELDS = [
  { value: 'co_number', labelKey: 'jobs:changeOrders.import.fieldNumber' },
  { value: 'job_name', labelKey: 'jobs:changeOrders.import.fieldJobName' },
  { value: 'title', labelKey: 'jobs:changeOrders.import.fieldTitle' },
  { value: 'description', labelKey: 'jobs:changeOrders.import.fieldDescription' },
  { value: 'amount', labelKey: 'jobs:changeOrders.import.fieldAmount' },
  { value: 'status', labelKey: 'jobs:changeOrders.import.fieldStatus' },
  { value: 'approved_date', labelKey: 'jobs:changeOrders.import.fieldApprovedDate' },
  { value: 'approved_by', labelKey: 'jobs:changeOrders.import.fieldApprovedBy' },
  { value: 'source', labelKey: 'jobs:changeOrders.import.fieldSource' },
  { value: 'external_ref', labelKey: 'jobs:changeOrders.import.fieldExternalRef' },
]

function fmtMoney(v) {
  if (v == null) return ''
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// `defaultProject` (optional {id, name}) pre-fills the job when the importer is
// opened from a job detail page and the sheet omits the Job Name column.
export default function ChangeOrderImportModal({ onClose, onImported, defaultProject = null }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()

  const [deps, setDeps] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const [{ data: coRows }, { data: projRows }, { data: clientRows }, { data: colRows }] = await Promise.all([
        supabase.from('change_orders').select('id, co_number, project_id, import_source').eq('company_id', companyId),
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
      const coIndex = new Map() // `${co_number}|${project_id}` → row
      for (const co of coRows ?? []) {
        const key = `${(co.co_number ?? '').trim().toLowerCase()}|${co.project_id}`
        if (co.co_number && !coIndex.has(key)) coIndex.set(key, co)
      }
      const columns = colRows ?? []
      const completeCol = columns.find(c => c.column_key === 'complete') ?? lowestPositionColumn(columns)
      setDeps({
        coIndex,
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

    const title = (mapped.title || '').trim()
    if (!title) flags.push('missing_title')

    let jobName = (mapped.job_name || '').trim()
    if (!jobName && defaultProject) jobName = defaultProject.name
    if (!jobName) flags.push('missing_job')
    let projMatch = jobName && deps ? deps.projectIndex.get(jobName.toLowerCase()) ?? null : null
    if (!projMatch && defaultProject && jobName === defaultProject.name) projMatch = defaultProject
    if (jobName && deps && !projMatch) warnings.push('new_job')

    const amount = parseMoney(mapped.amount)
    if ((mapped.amount || '').trim() && amount == null) warnings.push('bad_amount')

    const approvedAt = parseDateFlexible(mapped.approved_date)
    if ((mapped.approved_date || '').trim() && !approvedAt) warnings.push('invalid_date')

    const statusText = (mapped.status || '').trim()
    const explicitStatus = normalizeChangeOrderStatus(statusText)
    if (statusText && !explicitStatus) warnings.push('unknown_status')
    const status = explicitStatus ?? (approvedAt ? 'approved' : 'proposed')

    const sourceText = (mapped.source || '').trim().toLowerCase()
    const source = sourceText === 'buildertrend' ? 'buildertrend' : 'import'

    return {
      co_number: (mapped.co_number || '').trim(),
      job_name: jobName,
      title,
      description: mapped.description || '',
      approved_by: mapped.approved_by || '',
      external_ref: mapped.external_ref || '',
      client: '',
      _raw: mapped,
      _amount: amount,
      _status: status,
      _approvedAt: approvedAt,
      _source: source,
      _projectId: projMatch?.id ?? null,
      _clientId: null,
      _flags: flags,
      _warnings: [...new Set(warnings)],
    }
  }

  const config = {
    ns: 'jobs:changeOrders.import',
    targetFields: TARGET_FIELDS,
    requiredTargets: ['title'],
    skipFlags: ['missing_title', 'missing_job'],
    modes: true,
    matchExisting: (row) => {
      const num = (row.co_number || '').trim().toLowerCase()
      if (!num || !row._projectId) return null
      const match = deps?.coIndex.get(`${num}|${row._projectId}`)
      if (!match) return null
      return { id: match.id, isPlaceholder: isPlaceholderSource(match.import_source), existing: match }
    },
    dedupeKey: (row) => {
      const num = (row.co_number || '').trim().toLowerCase()
      return num ? `${num}|${(row.job_name || '').trim().toLowerCase()}` : null
    },
    buildRow,
    reviewColumns: [
      { key: 'number', labelKey: 'jobs:changeOrders.import.colNumber', render: (row) => row.co_number || t('import:empty'), badges: ['duplicate_in_file'] },
      { key: 'job', labelKey: 'jobs:changeOrders.import.colJob', render: (row) => row.job_name || t('import:empty'), badges: ['missing_job', 'new_job'] },
      { key: 'title', labelKey: 'jobs:changeOrders.import.colTitle', render: (row) => row.title || t('import:empty'), badges: ['missing_title'] },
      { key: 'amount', labelKey: 'jobs:changeOrders.import.colAmount', render: (row) => fmtMoney(row._amount), badges: ['bad_amount'] },
      { key: 'status', labelKey: 'jobs:changeOrders.import.colStatus', render: (row) => row._status, badges: ['unknown_status', 'invalid_date'] },
    ],
    flagLabels: {
      missing_title: 'jobs:changeOrders.import.badgeNoTitle',
      missing_job: 'jobs:changeOrders.import.badgeNoJob',
      new_job: 'jobs:changeOrders.import.badgeNewJob',
      bad_amount: 'jobs:changeOrders.import.badgeBadAmount',
      invalid_date: 'jobs:changeOrders.import.badgeBadDate',
      unknown_status: 'jobs:changeOrders.import.badgeUnknownStatus',
      duplicate_in_file: 'jobs:changeOrders.import.badgeDupFile',
      exists: 'import:badgeExists',
      no_match: 'import:badgeNoMatch',
    },
    reasonLabels: {
      missing_title: 'jobs:changeOrders.import.reasonMissingTitle',
    },
    uploadPromptKey: 'uploadPrompt',
    mapHintKey: 'mapHint',
    importBtnKey: 'importBtn',
    importSuccessKey: 'importSuccess',
    skipReasonKey: 'skipReason',
    templateBuilder: downloadChangeOrderTemplate,
    ready: !!deps?.placeholderColumnId,
    writeRows: ({ rows, batchId, mode, onProgress }) => writeChangeOrderRows({
      rows,
      batchId,
      mode,
      onProgress,
      companyId,
      userId: user.id,
      placeholderColumnId: deps.placeholderColumnId,
    }),
  }

  return <ImportWizardModal config={config} onClose={onClose} onImported={onImported} />
}
