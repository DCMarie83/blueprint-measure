import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { resolveColumnLabel } from '../../lib/kanbanColumnLabel'
import ImportWizardModal from '../import/ImportWizardModal'
import { downloadJobTemplate } from '../../utils/import/templates'
import { writeJobRows } from '../../utils/import/writeJobs'
import {
  buildClientIndex, matchClient, resolveKanbanColumn, lowestPositionColumn,
  normalizeProjectStatus, deriveProjectStatusFromColumn, parseMoney, parseDateFlexible,
} from '../../utils/import/importHelpers'

const TARGET_FIELDS = [
  { value: 'name', labelKey: 'jobs:import.fieldName' },
  { value: 'client', labelKey: 'jobs:import.fieldClient' },
  { value: 'address', labelKey: 'jobs:import.fieldAddress' },
  { value: 'column', labelKey: 'jobs:import.fieldColumn' },
  { value: 'status', labelKey: 'jobs:import.fieldStatus' },
  { value: 'contract_value', labelKey: 'jobs:import.fieldContractValue' },
  { value: 'scheduled_start', labelKey: 'jobs:import.fieldScheduledStart' },
  { value: 'estimated_completion', labelKey: 'jobs:import.fieldEstimatedCompletion' },
]

function fmtValue(v) {
  if (v == null) return ''
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function JobImportModal({ onClose, onImported }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()

  // Company lookups fetched ONCE for the whole run — client matching and
  // column resolution never query per row.
  const [deps, setDeps] = useState(null) // { clientIndex, columns, defaultCol }

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const [{ data: clientRows }, { data: colRows }] = await Promise.all([
        supabase.from('clients').select('id, display_name, business_name, primary_email').eq('company_id', companyId),
        supabase.from('kanban_columns').select('*').eq('company_id', companyId).order('position', { ascending: true }),
      ])
      if (cancelled) return
      const columns = colRows ?? []
      setDeps({
        clientIndex: buildClientIndex(clientRows ?? []),
        columns,
        defaultCol: lowestPositionColumn(columns),
      })
    })()
    return () => { cancelled = true }
  }, [companyId])

  function buildRow(mapped) {
    const flags = []
    const warnings = []

    const name = (mapped.name || '').trim()
    if (!name) flags.push('missing_name')

    const clientText = (mapped.client || '').trim()
    const clientMatch = deps ? matchClient(deps.clientIndex, clientText) : null
    if (clientText && deps && !clientMatch) warnings.push('new_client')

    const columnText = (mapped.column || '').trim()
    const col = deps ? resolveKanbanColumn(columnText, deps.columns) : null
    if (columnText && deps && !col) warnings.push('unknown_column')
    const effectiveCol = col ?? deps?.defaultCol ?? null

    const statusText = (mapped.status || '').trim()
    const explicitStatus = normalizeProjectStatus(statusText)
    if (statusText && !explicitStatus) warnings.push('unknown_status')
    const status = explicitStatus ?? deriveProjectStatusFromColumn(effectiveCol?.column_key)

    const contractValue = parseMoney(mapped.contract_value)
    if ((mapped.contract_value || '').trim() && contractValue == null) warnings.push('invalid_number')

    const scheduledStart = parseDateFlexible(mapped.scheduled_start)
    if ((mapped.scheduled_start || '').trim() && !scheduledStart) warnings.push('invalid_date')
    const estimatedCompletion = parseDateFlexible(mapped.estimated_completion)
    if ((mapped.estimated_completion || '').trim() && !estimatedCompletion) warnings.push('invalid_date')

    return {
      name,
      client: clientText,
      address: mapped.address || '',
      _clientId: clientMatch?.id ?? null,
      _kanbanColumnId: col?.id ?? null,
      _column: effectiveCol,
      _status: status,
      _contractValue: contractValue,
      _scheduledStart: scheduledStart,
      _estimatedCompletion: estimatedCompletion,
      _flags: flags,
      _warnings: [...new Set(warnings)],
    }
  }

  const config = {
    ns: 'jobs:import',
    targetFields: TARGET_FIELDS,
    requiredTargets: ['name'],
    skipFlags: ['missing_name'],
    buildRow,
    reviewColumns: [
      { key: 'job', labelKey: 'jobs:import.colJob', render: (row) => row.name || t('import:empty'), badges: ['missing_name'] },
      { key: 'client', labelKey: 'jobs:import.colClient', render: (row) => row.client || '', badges: ['new_client'] },
      { key: 'column', labelKey: 'jobs:import.colColumn', render: (row, tt) => resolveColumnLabel(tt, row._column), badges: ['unknown_column'] },
      { key: 'status', labelKey: 'jobs:import.colStatus', render: (row) => row._status, badges: ['unknown_status'] },
      { key: 'value', labelKey: 'jobs:import.colValue', render: (row) => fmtValue(row._contractValue), badges: ['invalid_number', 'invalid_date'] },
    ],
    flagLabels: {
      missing_name: 'jobs:import.badgeNoName',
      new_client: 'jobs:import.badgeNewClient',
      unknown_column: 'jobs:import.badgeUnknownColumn',
      unknown_status: 'jobs:import.badgeUnknownStatus',
      invalid_number: 'jobs:import.badgeInvalidNumber',
      invalid_date: 'jobs:import.badgeInvalidDate',
    },
    reasonLabels: {
      missing_name: 'jobs:import.reasonMissingName',
    },
    uploadPromptKey: 'uploadPrompt',
    mapHintKey: 'mapHint',
    importBtnKey: 'importBtn',
    importSuccessKey: 'importSuccess',
    skipReasonKey: 'skipReason',
    templateBuilder: downloadJobTemplate,
    ready: !!deps?.defaultCol,
    writeRows: ({ rows, batchId, onProgress }) => writeJobRows({
      rows,
      batchId,
      onProgress,
      companyId,
      userId: user.id,
      defaultColumnId: deps.defaultCol.id,
    }),
  }

  return <ImportWizardModal config={config} onClose={onClose} onImported={onImported} />
}
