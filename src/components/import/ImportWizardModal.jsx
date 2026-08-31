import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { parseImportFile } from '../../utils/import/parseImportFile'
import { mintBatchId } from '../../utils/import/importHelpers'
import { useColumnMapping } from './useColumnMapping'
import styles from './ImportWizardModal.module.css'

// Generic 4-step import wizard (Upload → Map → Review → Import), extracted from
// the original ClientImportModal. Everything entity-specific arrives via the
// `config` object:
//   ns              i18n prefix for entity strings, e.g. 'clients:import'
//   targetFields    [{ value, labelKey }] mappable target fields
//   requiredTargets target values that must be mapped before leaving Map
//   skipFlags       row flags that exclude a row from import ('duplicate_in_file' always skips)
//   dedupeKey       optional (row) => key for in-file duplicate detection
//   buildRow        (mappedValues, ctx) => normalized row with _flags/_warnings arrays
//   reviewColumns   [{ key, labelKey, render(row, t), badges: [flag...] }]
//   flagLabels      { flag: i18nKey } badge labels shown in Review
//   reasonLabels    { reason: i18nKey } skip reasons shown in the result
//   uploadPromptKey / mapHintKey / importBtnKey / importSuccessKey / skipReasonKey
//   templateBuilder async () => triggers the XLSX template download
//   MapExtras / ReviewExtras  optional components ({ ctx, setCtx, t })
//   defaultCtx      initial wizard context (entity-specific options)
//   ready           false while entity lookups are still loading (gates Import)
//   writeRows       async ({ rows, ctx, batchId, onProgress }) =>
//                     { imported, skipped, failed, created }
export default function ImportWizardModal({ config, onClose, onImported }) {
  const { t } = useTranslation()

  const [step, setStep] = useState(0)

  // Step 1 state
  const [parsed, setParsed] = useState(null) // { headers, rows }
  const [parseError, setParseError] = useState(null)
  const fileRef = useRef(null)

  // Step 2 state
  const { mapping, mappingLoading, requestMapping, setMappingFor } = useColumnMapping(config.targetFields)
  const [ctx, setCtx] = useState(config.defaultCtx ?? {})

  // Step 4 state
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState(null)

  const et = (key, opts) => t(`${config.ns}.${key}`, opts)

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

  function handleNextToMap() {
    if (!parsed) return
    setStep(1)
    requestMapping(parsed) // fire AI mapping (non-blocking)
  }

  // ── Step 2: Map ─────────────────────────────────────────────

  const mappedTargets = new Set(Object.values(mapping).filter(Boolean))
  const requiredMapped = (config.requiredTargets ?? []).every(tf => mappedTargets.has(tf))

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
      const built = config.buildRow(mapped, ctx)
      return { _flags: [], _warnings: [], ...built, _index: idx }
    })
  }

  function dedupeRows(rows) {
    if (!config.dedupeKey) return rows
    const seen = new Set()
    return rows.map(row => {
      const key = config.dedupeKey(row)
      if (key && seen.has(key)) {
        return { ...row, _flags: [...row._flags, 'duplicate_in_file'] }
      }
      if (key) seen.add(key)
      return row
    })
  }

  const skipFlagSet = new Set([...(config.skipFlags ?? []), 'duplicate_in_file'])
  const rowSkips = (row) => row._flags.some(f => skipFlagSet.has(f))

  function getReviewData() {
    const deduped = dedupeRows(buildMappedRows())
    const willImport = deduped.filter(r => !rowSkips(r))
    const willSkip = deduped.filter(rowSkips)
    return { all: deduped, willImport, willSkip }
  }

  // ── Step 4: Import ──────────────────────────────────────────

  async function handleImport() {
    const { willImport } = getReviewData()
    const batchId = mintBatchId()

    setImporting(true)
    setProgress({ current: 0, total: willImport.length })

    const res = await config.writeRows({
      rows: willImport,
      ctx,
      batchId,
      onProgress: (current, total) => setProgress({ current, total }),
    })

    setResult(res)
    setImporting(false)
    onImported?.() // ONE refresh for the whole run — never per-row
  }

  function renderBadges(row, badgeFlags) {
    const present = [...row._flags, ...row._warnings].filter(f => badgeFlags?.includes(f))
    return present.map(f => (
      config.flagLabels?.[f]
        ? <span key={f} className={styles.warnBadge}>{t(config.flagLabels[f])}</span>
        : null
    ))
  }

  // ── Render ──────────────────────────────────────────────────

  const STEPS = ['import:stepUpload', 'import:stepMap', 'import:stepReview', 'import:stepImport']
  const { MapExtras, ReviewExtras } = config

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
          <p className={styles.info}>{et(config.uploadPromptKey)}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx"
            className={styles.fileInput}
            onChange={handleFileSelect}
          />
          {parseError && <div className={styles.error}>{parseError}</div>}
          {parsed && <p className={styles.info}>{t('import:rowsFound', { count: parsed.rows.length, columns: parsed.headers.length })}</p>}
          <button type="button" className={styles.templateLink} onClick={config.templateBuilder}>
            {t('import:downloadTemplate')}
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
          {mappingLoading && <p className={styles.info}>{t('import:aiMapping')}</p>}

          {MapExtras && <MapExtras ctx={ctx} setCtx={setCtx} t={t} />}

          <div className={styles.mappingGrid}>
            {parsed?.headers.map(h => (
              <div key={h} className={styles.mappingRow}>
                <span className={styles.mappingSource}>{h}</span>
                <span className={styles.mappingArrow}>→</span>
                <select
                  className={styles.mappingSelect}
                  value={mapping[h] || ''}
                  onChange={e => setMappingFor(h, e.target.value)}
                >
                  <option value="">{t('import:skip')}</option>
                  {config.targetFields.map(f => (
                    <option key={f.value} value={f.value} disabled={mappedTargets.has(f.value) && mapping[h] !== f.value}>
                      {t(f.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!requiredMapped && (
            <div className={styles.error}>{et(config.mapHintKey)}</div>
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
            <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!requiredMapped} onClick={() => setStep(2)}>{t('common:action.next')}</button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 2 && (() => {
        const { all, willImport, willSkip } = getReviewData()
        return (
          <div>
            <p className={styles.info}>
              <strong>{willImport.length}</strong> {t('import:willImport')}, <strong>{willSkip.length}</strong> {t('import:skipped')}
              {willSkip.length > 0 && ` (${et(config.skipReasonKey)})`}
            </p>

            {ReviewExtras && <ReviewExtras ctx={ctx} setCtx={setCtx} t={t} />}

            <div className={styles.previewWrap} style={{ maxHeight: 300 }}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    {config.reviewColumns.map(col => <th key={col.key}>{t(col.labelKey)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {all.map((row, i) => (
                    <tr key={i} className={rowSkips(row) ? styles.skipRow : ''}>
                      {config.reviewColumns.map(col => (
                        <td key={col.key}>
                          {col.render(row, t)}
                          {renderBadges(row, col.badges)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.actions}>
              <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setStep(1)}>{t('common:action.back')}</button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={willImport.length === 0 || config.ready === false}
                onClick={() => { setStep(3); handleImport() }}
              >
                {et(config.importBtnKey, { count: willImport.length })}
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
              <p className={styles.info}>{t('import:importingProgress', { current: progress.current, total: progress.total })}</p>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }} />
              </div>
            </>
          ) : result ? (
            <>
              <div className={styles.success}>
                {et(config.importSuccessKey, { count: result.imported.length })}
              </div>
              {(result.created?.length ?? 0) > 0 && (
                <div className={styles.resultList}>
                  <strong>{t('import:createdCount', { count: result.created.length })}</strong>
                  {result.created.slice(0, 10).map((c, i) => (
                    <div key={i} className={styles.resultItem}>
                      {t(c.type === 'client' ? 'import:createdClient' : 'import:createdJob')}: {c.name}
                    </div>
                  ))}
                  {result.created.length > 10 && <div className={styles.resultItem}>{t('import:andMore', { count: result.created.length - 10 })}</div>}
                </div>
              )}
              {result.skipped.length > 0 && (
                <div className={styles.resultList}>
                  <strong>{t('import:skippedCount', { count: result.skipped.length })}</strong>
                  {result.skipped.slice(0, 10).map((s, i) => (
                    <div key={i} className={styles.resultItem}>
                      {s.name} — {config.reasonLabels?.[s.reason] ? t(config.reasonLabels[s.reason]) : s.reason}
                    </div>
                  ))}
                  {result.skipped.length > 10 && <div className={styles.resultItem}>{t('import:andMore', { count: result.skipped.length - 10 })}</div>}
                </div>
              )}
              {result.failed.length > 0 && (
                <div className={styles.resultList}>
                  <strong>{t('import:failedCount', { count: result.failed.length })}</strong>
                  {result.failed.slice(0, 5).map((f, i) => (
                    <div key={i} className={styles.resultItem}>{f.name} — {f.error}</div>
                  ))}
                </div>
              )}
              <div className={styles.actions}>
                <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>{t('import:done')}</button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
