import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import ImportWizardModal from '../import/ImportWizardModal'
import { downloadPricingTemplate } from '../../utils/import/templates'
import { writePricingItemRows } from '../../utils/import/writePricingItems'
import { normalizeUnit, parseMoney } from '../../utils/import/importHelpers'

const TARGET_FIELDS = [
  { value: 'name', labelKey: 'pricing:import.fieldName' },
  { value: 'unit', labelKey: 'pricing:import.fieldUnit' },
  { value: 'rate', labelKey: 'pricing:import.fieldRate' },
  { value: 'category', labelKey: 'pricing:import.fieldCategory' },
  { value: 'description', labelKey: 'pricing:import.fieldDescription' },
]

export default function PricingImportModal({ onClose, onImported, initialRows = null, afterImport = null }) {
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()

  const [deps, setDeps] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const [{ data: itemRows }, { data: catRows }] = await Promise.all([
        supabase.from('pricing_items').select('id, name, unit, source').eq('company_id', companyId),
        supabase.from('pricing_categories').select('id, name, sort_order').eq('company_id', companyId),
      ])
      if (cancelled) return
      const existingByKey = new Map()
      for (const item of itemRows ?? []) {
        const key = `${(item.name ?? '').trim().toLowerCase()}|${(item.unit ?? '').trim().toLowerCase()}`
        if (!existingByKey.has(key)) existingByKey.set(key, item)
      }
      setDeps({ existingByKey, categories: catRows ?? [] })
    })()
    return () => { cancelled = true }
  }, [companyId])

  function buildRow(mapped) {
    const flags = []
    const warnings = []

    const name = (mapped.name || '').trim()
    if (!name) flags.push('missing_name')

    const rawUnit = (mapped.unit || '').trim()
    const unit = normalizeUnit(rawUnit, 'each')
    if (rawUnit && normalizeUnit(rawUnit, null) == null) warnings.push('unknown_unit')

    const rate = parseMoney(mapped.rate)
    if (!(rate > 0)) flags.push('invalid_rate')

    return {
      name,
      category: mapped.category || '',
      description: mapped.description || '',
      _raw: mapped,
      _unit: unit,
      _rate: rate > 0 ? rate : null,
      _flags: flags,
      _warnings: warnings,
    }
  }

  const config = {
    ns: 'pricing:import',
    targetFields: TARGET_FIELDS,
    requiredTargets: ['name', 'rate'],
    skipFlags: ['missing_name', 'invalid_rate'],
    modes: true,
    matchExisting: (row) => {
      const key = `${(row.name || '').trim().toLowerCase()}|${row._unit}`
      const match = deps?.existingByKey.get(key)
      if (!match) return null
      return { id: match.id, isPlaceholder: false, existing: match }
    },
    dedupeKey: (row) => `${(row.name || '').trim().toLowerCase()}|${row._unit}`,
    buildRow,
    editableReview: !!initialRows,
    reviewColumns: [
      { key: 'name', labelKey: 'pricing:import.colName', render: (row) => row.name || t('import:empty'), badges: ['missing_name', 'duplicate_in_file'], editKey: 'name' },
      { key: 'unit', labelKey: 'pricing:import.colUnit', render: (row) => row._unit, badges: ['unknown_unit'], editKey: 'unit' },
      { key: 'rate', labelKey: 'pricing:import.colRate', render: (row) => (row._rate != null ? `$${row._rate.toFixed(2)}` : ''), badges: ['invalid_rate'], editKey: 'rate' },
      { key: 'category', labelKey: 'pricing:import.colCategory', render: (row) => row.category || '', editKey: 'category' },
    ],
    flagLabels: {
      missing_name: 'pricing:import.badgeNoName',
      invalid_rate: 'pricing:import.badgeBadRate',
      unknown_unit: 'pricing:import.badgeUnknownUnit',
      duplicate_in_file: 'pricing:import.badgeDupFile',
      exists: 'import:badgeExists',
      no_match: 'import:badgeNoMatch',
    },
    reasonLabels: {
      missing_fields: 'pricing:import.reasonMissingFields',
      exists: 'pricing:import.reasonExists',
    },
    uploadPromptKey: 'uploadPrompt',
    mapHintKey: 'mapHint',
    importBtnKey: 'importBtn',
    importSuccessKey: 'importSuccess',
    skipReasonKey: 'skipReason',
    templateBuilder: downloadPricingTemplate,
    ready: !!deps,
    afterImport,
    writeRows: ({ rows, onProgress }) => writePricingItemRows({
      rows,
      onProgress,
      companyId,
      existingByKey: deps.existingByKey,
      categories: deps.categories,
    }),
  }

  return <ImportWizardModal config={config} onClose={onClose} onImported={onImported} initialRows={initialRows} />
}
