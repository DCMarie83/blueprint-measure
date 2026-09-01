import { useTranslation } from 'react-i18next'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useClients } from '../../hooks/useClients'
import ImportWizardModal from '../import/ImportWizardModal'
import { downloadClientTemplate } from '../../utils/import/templates'
import { writeClientRows } from '../../utils/import/writeClients'
import { normalizeClientType, normalizeBillingTerms, isValidEmail, buildClientMatcher, isPlaceholderSource } from '../../utils/import/importHelpers'
import styles from '../import/ImportWizardModal.module.css'

const TARGET_FIELDS = [
  { value: 'display_name', labelKey: 'clients:import.fieldClientName' },
  { value: 'business_name', labelKey: 'clients:import.fieldBusinessName' },
  { value: 'primary_email', labelKey: 'clients:import.fieldEmail' },
  { value: 'primary_phone', labelKey: 'clients:import.fieldPhone' },
  { value: 'client_type', labelKey: 'clients:import.fieldClientType' },
  { value: 'property_type', labelKey: 'clients:import.fieldPropertyType' },
  { value: 'billing_terms', labelKey: 'clients:import.fieldBillingTerms' },
  { value: 'company_website', labelKey: 'clients:import.fieldWebsite' },
  { value: 'tax_id', labelKey: 'clients:import.fieldTaxId' },
  { value: 'notes', labelKey: 'clients:import.fieldNotes' },
  { value: 'addr_street', labelKey: 'clients:import.fieldStreet' },
  { value: 'addr_unit', labelKey: 'clients:import.fieldUnit' },
  { value: 'addr_city', labelKey: 'clients:import.fieldCity' },
  { value: 'addr_state', labelKey: 'clients:import.fieldState' },
  { value: 'addr_zip', labelKey: 'clients:import.fieldZip' },
]

function MapExtras({ ctx, setCtx, t }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {t('clients:import.defaultType')}
      </label>
      <div className={styles.typeToggle}>
        <button type="button" className={`${styles.typeBtn} ${ctx.defaultType === 'residential' ? styles.typeBtnActive : ''}`} onClick={() => setCtx(c => ({ ...c, defaultType: 'residential' }))}>{t('clients:form.residential')}</button>
        <button type="button" className={`${styles.typeBtn} ${ctx.defaultType === 'commercial' ? styles.typeBtnActive : ''}`} onClick={() => setCtx(c => ({ ...c, defaultType: 'commercial' }))}>{t('clients:form.commercial')}</button>
      </div>
    </div>
  )
}

function ReviewExtras({ ctx, setCtx, t }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={ctx.addressesAreJobsites} onChange={e => setCtx(c => ({ ...c, addressesAreJobsites: e.target.checked }))} />
      {t('clients:import.addressesJobsites')}
    </label>
  )
}

function buildRow(mapped, ctx) {
  const row = { ...mapped }
  row.client_type = normalizeClientType(mapped.client_type, ctx.defaultType)

  const flags = []
  const warnings = []
  if (!(mapped.display_name || '').trim()) flags.push('missing_name')
  if (mapped.primary_email && !isValidEmail(mapped.primary_email.trim())) flags.push('invalid_email')

  const rawTerms = (mapped.billing_terms || '').trim()
  row.billing_terms = normalizeBillingTerms(rawTerms)
  if (rawTerms && !row.billing_terms) warnings.push('unknown_terms')

  return { ...row, _raw: mapped, _flags: flags, _warnings: warnings }
}

function addressOf(row) {
  return [row.addr_street, row.addr_city, row.addr_state, row.addr_zip].filter(Boolean).join(', ')
}

export default function ClientImportModal({ onClose, onImported }) {
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()
  const { clients } = useClients()

  const matchClientRow = buildClientMatcher(clients)

  const config = {
    ns: 'clients:import',
    targetFields: TARGET_FIELDS,
    requiredTargets: ['display_name'],
    skipFlags: ['missing_name', 'invalid_email'],
    modes: true,
    matchExisting: (row) => {
      const match = matchClientRow(row)
      if (!match) return null
      return { id: match.id, isPlaceholder: isPlaceholderSource(match.import_source), existing: match }
    },
    dedupeKey: (row) => (row.primary_email || '').trim().toLowerCase() || null,
    buildRow,
    reviewColumns: [
      { key: 'name', labelKey: 'clients:import.colName', render: (row) => row.display_name || t('import:empty'), badges: ['missing_name', 'duplicate_in_file', 'unknown_terms'] },
      { key: 'type', labelKey: 'clients:import.colType', render: (row) => row.client_type },
      { key: 'email', labelKey: 'clients:import.colEmail', render: (row) => row.primary_email || '', badges: ['invalid_email'] },
      { key: 'phone', labelKey: 'clients:import.colPhone', render: (row) => row.primary_phone || '' },
      { key: 'address', labelKey: 'clients:import.colAddress', render: (row) => addressOf(row) },
    ],
    flagLabels: {
      missing_name: 'clients:import.badgeNoName',
      duplicate_in_file: 'clients:import.badgeDup',
      invalid_email: 'clients:import.badgeInvalid',
      unknown_terms: 'clients:import.badgeTermsIgnored',
    },
    reasonLabels: {
      missing_name: 'clients:import.reasonMissingName',
      duplicate_email: 'clients:import.reasonDuplicateEmail',
    },
    uploadPromptKey: 'uploadPrompt',
    mapHintKey: 'mapNameHint',
    importBtnKey: 'importBtn',
    importSuccessKey: 'importSuccess',
    skipReasonKey: 'skipReason',
    templateBuilder: downloadClientTemplate,
    MapExtras,
    ReviewExtras,
    defaultCtx: { defaultType: 'residential', addressesAreJobsites: false },
    writeRows: ({ rows, ctx, batchId, onProgress }) => writeClientRows({
      rows,
      ctx,
      batchId,
      onProgress,
      companyId,
      existingEmails: new Set(clients.filter(c => c.primary_email).map(c => c.primary_email.toLowerCase())),
    }),
  }

  return <ImportWizardModal config={config} onClose={onClose} onImported={onImported} />
}
