import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import ImportWizardModal from '../import/ImportWizardModal'
import { downloadTimeEntryTemplate } from '../../utils/import/templates'
import { writeTimeEntryRows } from '../../utils/import/writeTimeEntries'
import { parseDateFlexible, parseMoney } from '../../utils/import/importHelpers'

const TARGET_FIELDS = [
  { value: 'date', labelKey: 'time:import.fieldDate' },
  { value: 'crew', labelKey: 'time:import.fieldCrew' },
  { value: 'job_name', labelKey: 'time:import.fieldJobName' },
  { value: 'hours', labelKey: 'time:import.fieldHours' },
  { value: 'note', labelKey: 'time:import.fieldNote' },
]

export default function TimeEntryImportModal({ onClose, onImported }) {
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()

  const [deps, setDeps] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const [{ data: crewRows }, { data: projRows }] = await Promise.all([
        supabase.from('crew_members').select('id, name, is_active').eq('company_id', companyId),
        supabase.from('projects').select('id, name').eq('company_id', companyId).is('deleted_at', null),
      ])
      if (cancelled) return
      const crewIndex = new Map()
      for (const c of crewRows ?? []) {
        const key = (c.name ?? '').trim().toLowerCase()
        if (key && !crewIndex.has(key)) crewIndex.set(key, c)
      }
      const projectIndex = new Map()
      for (const p of projRows ?? []) {
        const key = (p.name ?? '').trim().toLowerCase()
        if (key && !projectIndex.has(key)) projectIndex.set(key, p)
      }
      setDeps({ crewIndex, projectIndex })
    })()
    return () => { cancelled = true }
  }, [companyId])

  function buildRow(mapped) {
    const flags = []
    const warnings = []

    const date = parseDateFlexible(mapped.date)
    if (!date) flags.push('invalid_date')

    const crew = (mapped.crew || '').trim()
    if (!crew) flags.push('missing_crew')
    else if (deps && !deps.crewIndex.has(crew.toLowerCase())) warnings.push('new_crew')

    const jobName = (mapped.job_name || '').trim()
    if (!jobName) flags.push('missing_job')
    else if (deps && !deps.projectIndex.has(jobName.toLowerCase())) flags.push('no_job_match')

    const hours = parseMoney(mapped.hours)
    if (!(hours > 0) || hours > 24) flags.push('invalid_hours')

    return {
      crew,
      job_name: jobName,
      note: mapped.note || '',
      _raw: mapped,
      _date: date,
      _hours: hours > 0 && hours <= 24 ? hours : null,
      _flags: flags,
      _warnings: warnings,
    }
  }

  const config = {
    ns: 'time:import',
    targetFields: TARGET_FIELDS,
    requiredTargets: ['date', 'crew', 'job_name', 'hours'],
    skipFlags: ['invalid_date', 'missing_crew', 'missing_job', 'no_job_match', 'invalid_hours'],
    buildRow,
    reviewColumns: [
      { key: 'date', labelKey: 'time:import.colDate', render: (row) => row._date || t('import:empty'), badges: ['invalid_date'] },
      { key: 'crew', labelKey: 'time:import.colCrew', render: (row) => row.crew || t('import:empty'), badges: ['missing_crew', 'new_crew'] },
      { key: 'job', labelKey: 'time:import.colJob', render: (row) => row.job_name || t('import:empty'), badges: ['missing_job', 'no_job_match'] },
      { key: 'hours', labelKey: 'time:import.colHours', render: (row) => (row._hours != null ? String(row._hours) : ''), badges: ['invalid_hours'] },
    ],
    flagLabels: {
      invalid_date: 'time:import.badgeBadDate',
      missing_crew: 'time:import.badgeNoCrew',
      new_crew: 'time:import.badgeNewCrew',
      missing_job: 'time:import.badgeNoJob',
      no_job_match: 'time:import.badgeNoJobMatch',
      invalid_hours: 'time:import.badgeBadHours',
    },
    reasonLabels: {
      missing_fields: 'time:import.reasonMissingFields',
      no_job_match: 'time:import.reasonNoJobMatch',
    },
    uploadPromptKey: 'uploadPrompt',
    mapHintKey: 'mapHint',
    importBtnKey: 'importBtn',
    importSuccessKey: 'importSuccess',
    skipReasonKey: 'skipReason',
    templateBuilder: downloadTimeEntryTemplate,
    ready: !!deps,
    writeRows: ({ rows, onProgress }) => writeTimeEntryRows({
      rows,
      onProgress,
      companyId,
      crewIndex: deps.crewIndex,
      projectIndex: deps.projectIndex,
    }),
  }

  return <ImportWizardModal config={config} onClose={onClose} onImported={onImported} />
}
