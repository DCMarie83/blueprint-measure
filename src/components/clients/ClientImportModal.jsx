import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useClients } from '../../hooks/useClients'
import { parseImportFile } from '../../utils/clientImportParser'
import { importClients } from '../../utils/clientImportWriter'
import { downloadClientTemplate } from '../../utils/clientImportTemplate'
import styles from './ClientImportModal.module.css'

const TARGET_FIELDS = [
  { value: 'display_name', label: 'clients:import.fieldClientName' },
  { value: 'business_name', label: 'clients:import.fieldBusinessName' },
  { value: 'primary_email', label: 'clients:import.fieldEmail' },
  { value: 'primary_phone', label: 'clients:import.fieldPhone' },
  { value: 'client_type', label: 'clients:import.fieldClientType' },
  { value: 'property_type', label: 'clients:import.fieldPropertyType' },
  { value: 'billing_terms', label: 'clients:import.fieldBillingTerms' },
  { value: 'company_website', label: 'clients:import.fieldWebsite' },
  { value: 'tax_id', label: 'clients:import.fieldTaxId' },
  { value: 'notes', label: 'clients:import.fieldNotes' },
  { value: 'addr_street', label: 'clients:import.fieldStreet' },
  { value: 'addr_unit', label: 'clients:import.fieldUnit' },
  { value: 'addr_city', label: 'clients:import.fieldCity' },
  { value: 'addr_state', label: 'clients:import.fieldState' },
  { value: 'addr_zip', label: 'clients:import.fieldZip' },
]

const STEPS = ['clients:import.stepUpload', 'clients:import.stepMap', 'clients:import.stepReview', 'clients:import.stepImport']

export default function ClientImportModal({ onClose, onImported }) {
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()
  const { clients, createClient } = useClients()

  const [step, setStep] = useState(0)

  // Step 1 state
  const [parsed, setParsed] = useState(null) // { headers, rows }
  const [parseError, setParseError] = useState(null)
  const fileRef = useRef(null)

  // Step 2 state
  const [mapping, setMapping] = useState({}) // { sourceHeader: targetField|null }
  const [mappingLoading, setMappingLoading] = useState(false)
  const [defaultType, setDefaultType] = useState('residential')

  // Step 3 state
  const [addressesAreJobsites, setAddressesAreJobsites] = useState(false)

  // Step 4 state
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState(null)

  // ── Step 1: Upload ──────────────────────────────────────────

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)
    try {
      const data = await parseImportFile(file)
      setParsed(data)
    } catch (err) {
      setParseError(err.message)
      setParsed(null)
    }
  }

  async function handleNextToMap() {
    if (!parsed) return
    // Initialize mapping to all null
    const initial = {}
    parsed.headers.forEach(h => { initial[h] = null })
    setMapping(initial)
    setStep(1)

    // Fire AI mapping (non-blocking)
    setMappingLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('map-import-columns', {
        body: { headers: parsed.headers, sampleRows: parsed.rows.slice(0, 5) },
      })
      if (!error && data && !data.ai_failed && data.mapping) {
        const validTargets = new Set(TARGET_FIELDS.map(f => f.value))
        const usedTargets = new Set()
        const aiMapping = {}
        parsed.headers.forEach(h => {
          const suggested = data.mapping[h]
          if (suggested && validTargets.has(suggested) && !usedTargets.has(suggested)) {
            aiMapping[h] = suggested
            usedTargets.add(suggested)
          } else {
            aiMapping[h] = null
          }
        })
        setMapping(aiMapping)
      }
    } catch { /* fall back to manual */ }
    finally { setMappingLoading(false) }
  }

  // ── Step 2: Map ─────────────────────────────────────────────

  function updateMapping(header, target) {
    setMapping(prev => ({ ...prev, [header]: target || null }))
  }

  const hasDisplayNameMapped = Object.values(mapping).includes('display_name')

  function getUsedTargets() {
    const used = new Set()
    Object.values(mapping).forEach(v => { if (v) used.add(v) })
    return used
  }

  // ── Step 3: Review ──────────────────────────────────────────

  function buildMappedRows() {
    if (!parsed) return []
    const reverseMap = {} // targetField → sourceHeader
    Object.entries(mapping).forEach(([src, tgt]) => { if (tgt) reverseMap[tgt] = src })

    return parsed.rows.map((row, idx) => {
      const mapped = {}
      Object.entries(reverseMap).forEach(([target, source]) => {
        mapped[target] = row[source] || ''
      })
      // Resolve client_type
      const rawType = (mapped.client_type || '').toLowerCase()
      mapped.client_type = (rawType === 'residential' || rawType === 'commercial' || rawType === 'general_contractor') ? rawType : defaultType

      // Validation
      const flags = []
      if (!(mapped.display_name || '').trim()) flags.push('missing_name')
      if (mapped.primary_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.primary_email)) flags.push('invalid_email')

      return { ...mapped, _index: idx, _flags: flags }
    })
  }

  function dedupeRows(rows) {
    const seen = new Set()
    return rows.map(row => {
      const email = (row.primary_email || '').toLowerCase()
      if (email && seen.has(email)) {
        return { ...row, _flags: [...row._flags, 'duplicate_in_file'] }
      }
      if (email) seen.add(email)
      return row
    })
  }

  function getReviewData() {
    const mapped = buildMappedRows()
    const deduped = dedupeRows(mapped)
    const willImport = deduped.filter(r => !r._flags.includes('missing_name') && !r._flags.includes('duplicate_in_file'))
    const willSkip = deduped.filter(r => r._flags.includes('missing_name') || r._flags.includes('duplicate_in_file'))
    return { all: deduped, willImport, willSkip }
  }

  // ── Step 4: Import ──────────────────────────────────────────

  async function handleImport() {
    const { willImport } = getReviewData()
    const existingEmails = new Set(
      clients.filter(c => c.primary_email).map(c => c.primary_email.toLowerCase())
    )

    setImporting(true)
    setProgress({ current: 0, total: willImport.length })

    const res = await importClients({
      rows: willImport,
      defaultClientType: defaultType,
      addressesAreJobsites,
      existingEmails,
      createClient,
      companyId,
      onProgress: (current, total) => setProgress({ current, total }),
    })

    setResult(res)
    setImporting(false)
    onImported?.()
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div>
      {/* Step indicators */}
      <div className={styles.steps}>
        {STEPS.map((s, i) => (
          <div key={s} className={`${styles.step} ${i === step ? styles.stepActive : i < step ? styles.stepDone : ''}`}>
            {t(s)}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 0 && (
        <div>
          <p className={styles.info}>{t('clients:import.uploadPrompt')}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx"
            className={styles.fileInput}
            onChange={handleFileSelect}
          />
          {parseError && <div className={styles.error}>{parseError}</div>}
          {parsed && <p className={styles.info}>{t('clients:import.rowsFound', { count: parsed.rows.length, columns: parsed.headers.length })}</p>}
          <button type="button" className={styles.templateLink} onClick={downloadClientTemplate}>
            {t('clients:import.downloadTemplate')}
          </button>
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>{t('common:action.cancel')}</button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!parsed} onClick={handleNextToMap}>{t('common:action.next')}</button>
          </div>
        </div>
      )}

      {/* Step 2: Map */}
      {step === 1 && (
        <div>
          {mappingLoading && <p className={styles.info}>{t('clients:import.aiMapping')}</p>}

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('clients:import.defaultType')}
            </label>
            <div className={styles.typeToggle}>
              <button type="button" className={`${styles.typeBtn} ${defaultType === 'residential' ? styles.typeBtnActive : ''}`} onClick={() => setDefaultType('residential')}>{t('clients:form.residential')}</button>
              <button type="button" className={`${styles.typeBtn} ${defaultType === 'commercial' ? styles.typeBtnActive : ''}`} onClick={() => setDefaultType('commercial')}>{t('clients:form.commercial')}</button>
            </div>
          </div>

          <div className={styles.mappingGrid}>
            {parsed?.headers.map(h => {
              const used = getUsedTargets()
              return (
                <div key={h} className={styles.mappingRow}>
                  <span className={styles.mappingSource}>{h}</span>
                  <span className={styles.mappingArrow}>→</span>
                  <select
                    className={styles.mappingSelect}
                    value={mapping[h] || ''}
                    onChange={e => updateMapping(h, e.target.value)}
                  >
                    <option value="">{t('clients:import.skip')}</option>
                    {TARGET_FIELDS.map(f => (
                      <option key={f.value} value={f.value} disabled={used.has(f.value) && mapping[h] !== f.value}>
                        {t(f.label)}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          {!hasDisplayNameMapped && (
            <div className={styles.error}>{t('clients:import.mapNameHint')}</div>
          )}

          {/* Preview */}
          {parsed && parsed.rows.length > 0 && (
            <div className={styles.previewWrap}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>{parsed.headers.map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 3).map((row, i) => (
                    <tr key={i}>{parsed.headers.map(h => <td key={h}>{row[h]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setStep(0)}>{t('common:action.back')}</button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!hasDisplayNameMapped} onClick={() => setStep(2)}>{t('common:action.next')}</button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 2 && (() => {
        const { all, willImport, willSkip } = getReviewData()
        return (
          <div>
            <p className={styles.info}>
              <strong>{willImport.length}</strong> {t('clients:import.willImport')}, <strong>{willSkip.length}</strong> {t('clients:import.skipped')}
              {willSkip.length > 0 && ` (${t('clients:import.skipReason')})`}
            </p>

            <label className={styles.toggle}>
              <input type="checkbox" checked={addressesAreJobsites} onChange={e => setAddressesAreJobsites(e.target.checked)} />
              {t('clients:import.addressesJobsites')}
            </label>

            <div className={styles.previewWrap} style={{ maxHeight: 300 }}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    <th>{t('clients:import.colName')}</th>
                    <th>{t('clients:import.colType')}</th>
                    <th>{t('clients:import.colEmail')}</th>
                    <th>{t('clients:import.colPhone')}</th>
                    <th>{t('clients:import.colAddress')}</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((row, i) => {
                    const skip = row._flags.includes('missing_name') || row._flags.includes('duplicate_in_file')
                    const addrParts = [row.addr_street, row.addr_city, row.addr_state, row.addr_zip].filter(Boolean)
                    return (
                      <tr key={i} className={skip ? styles.skipRow : ''}>
                        <td>
                          {row.display_name || t('clients:import.empty')}
                          {row._flags.includes('missing_name') && <span className={styles.warnBadge}>{t('clients:import.badgeNoName')}</span>}
                          {row._flags.includes('duplicate_in_file') && <span className={styles.warnBadge}>{t('clients:import.badgeDup')}</span>}
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{row.client_type}</td>
                        <td>
                          {row.primary_email || ''}
                          {row._flags.includes('invalid_email') && <span className={styles.warnBadge}>{t('clients:import.badgeInvalid')}</span>}
                        </td>
                        <td>{row.primary_phone || ''}</td>
                        <td>{addrParts.join(', ') || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.actions}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setStep(1)}>{t('common:action.back')}</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={willImport.length === 0} onClick={() => { setStep(3); handleImport() }}>
                {t('clients:import.importBtn', { count: willImport.length })}
              </button>
            </div>
          </div>
        )
      })()}

      {/* Step 4: Import */}
      {step === 3 && (
        <div>
          {importing ? (
            <>
              <p className={styles.info}>{t('clients:import.importingProgress', { current: progress.current, total: progress.total })}</p>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }} />
              </div>
            </>
          ) : result ? (
            <>
              <div className={styles.success}>
                {t('clients:import.importSuccess', { count: result.imported.length })}
              </div>
              {result.skipped.length > 0 && (
                <div className={styles.resultList}>
                  <strong>{t('clients:import.skippedCount', { count: result.skipped.length })}</strong>
                  {result.skipped.slice(0, 10).map((s, i) => (
                    <div key={i} className={styles.resultItem}>{s.name} — {s.reason === 'missing_name' ? t('clients:import.reasonMissingName') : t('clients:import.reasonDuplicateEmail')}</div>
                  ))}
                  {result.skipped.length > 10 && <div className={styles.resultItem}>{t('clients:import.andMore', { count: result.skipped.length - 10 })}</div>}
                </div>
              )}
              {result.failed.length > 0 && (
                <div className={styles.resultList}>
                  <strong>{t('clients:import.failedCount', { count: result.failed.length })}</strong>
                  {result.failed.slice(0, 5).map((f, i) => (
                    <div key={i} className={styles.resultItem}>{f.name} — {f.error}</div>
                  ))}
                </div>
              )}
              <div className={styles.actions}>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>{t('clients:import.done')}</button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
