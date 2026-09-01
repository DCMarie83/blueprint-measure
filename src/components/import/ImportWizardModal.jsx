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
//   matchExisting   optional (row) => { id, isPlaceholder, existing } | null — enables
//                   upsert dispositions together with `modes: true`
//   modes           true → show the Add / Update / Add-and-update selector
//   reviewColumns   [{ key, labelKey, render(row, t), badges: [flag...], editKey }]
//   editableReview  true → cells with an editKey render as inputs in Review
//   flagLabels      { flag: i18nKey } badge labels shown in Review
//   reasonLabels    { reason: i18nKey } skip reasons shown in the result
//   uploadPromptKey / mapHintKey / importBtnKey / importSuccessKey / skipReasonKey
//   templateBuilder async () => triggers the XLSX template download
//   MapExtras / ReviewExtras  optional components ({ ctx, setCtx, t })
//   defaultCtx      initial wizard context (entity-specific options)
//   ready           false while entity lookups are still loading (gates Import)
//   writeRows       async ({ rows, ctx, batchId, mode, extra, onProgress }) =>
//                     { imported, skipped, failed, created, updated }
//   afterImport     optional async (result, rows) — runs after writeRows (e.g. to
//                   link source documents); failures are swallowed
//
// Document mode: pass `initialRows` (already keyed by target-field names) and the
// wizard skips Upload/Map, entering directly at Review.
export default function ImportWizardModal({ config, onClose, onImported, initialRows = null }) {
  const { t } = useTranslation()

  const docMode = Array.isArray(initialRows) && initialRows.length > 0
  const [step, setStep] = useState(docMode ? 2 : 0)

  // Step 1 state
  const [parsed, setParsed] = useState(null) // { headers, rows, extraSheets }
  const [parseError, setParseError] = useState(null)
  const fileRef = useRef(null)
  // Document mode enters at Review, past the Upload-step selector — default to
  // 'both' there so matching rows update instead of all skipping as "exists".
  const [mode, setMode] = useState(docMode ? 'both' : 'add') // 'add' | 'update' | 'both'

  // Step 2 state
  const { mapping, mappingLoading, requestMapping, setMappingFor } = useColumnMapping(config.targetFields)
  const [ctx, setCtx] = useState(config.defaultCtx ?? {})

  // Step 3 state — manual cell edits, keyed by row index → target field
  const [edits, setEdits] = useState({})

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
  const requiredMapped = docMode || (config.requiredTargets ?? []).every(tf => mappedTargets.has(tf))

  // ── Step 3: Review ──────────────────────────────────────────

  function buildMappedRows() {
    let baseRows
    if (docMode) {
      baseRows = initialRows
    } else {
      if (!parsed) return []
      const reverseMap = {} // targetField → sourceHeader
      Object.entries(mapping).forEach(([src, tgt]) => { if (tgt) reverseMap[tgt] = src })
      baseRows = parsed.rows.map(row => {
        const mapped = {}
        Object.entries(reverseMap).forEach(([target, source]) => {
          mapped[target] = row[source] || ''
        })
        return mapped
      })
    }

    return baseRows.map((mapped, idx) => {
      const withEdits = edits[idx] ? { ...mapped, ...edits[idx] } : mapped
      const built = config.buildRow(withEdits, ctx)
      const row = { _flags: [], _warnings: [], ...built, _index: idx }
      // Carry document-mode passthrough fields (doc linkage, extracted lines,
      // confidence) — any underscore-prefixed key the config didn't rebuild.
      if (docMode) {
        for (const k of Object.keys(mapped)) {
          if (k.startsWith('_') && row[k] == null) row[k] = mapped[k]
        }
        if (row._lowConfidence?.length && !row._warnings.includes('low_confidence')) {
          row._warnings = [...row._warnings, 'low_confidence']
        }
      }
      return row
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

  // Upsert disposition: placeholders always update in place; real matches skip
  // in add mode and update otherwise; unmatched rows skip in update-only mode.
  function applyDispositions(rows) {
    if (!config.modes || !config.matchExisting) {
      return rows.map(r => ({ ...r, _disposition: 'new' }))
    }
    return rows.map(row => {
      const match = config.matchExisting(row)
      if (!match) {
        return mode === 'update'
          ? { ...row, _disposition: 'skip', _flags: [...row._flags, 'no_match'] }
          : { ...row, _disposition: 'new' }
      }
      if (match.isPlaceholder) {
        return { ...row, _disposition: 'update', _existingId: match.id, _existing: match.existing }
      }
      if (mode === 'add') {
        return { ...row, _disposition: 'skip', _existingId: match.id, _flags: [...row._flags, 'exists'] }
      }
      return { ...row, _disposition: 'update', _existingId: match.id, _existing: match.existing }
    })
  }

  const skipFlagSet = new Set([...(config.skipFlags ?? []), 'duplicate_in_file'])
  const rowSkips = (row) => row._disposition === 'skip' || row._flags.some(f => skipFlagSet.has(f))

  function getReviewData() {
    const deduped = applyDispositions(dedupeRows(buildMappedRows()))
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
      mode,
      extra: parsed?.extraSheets ?? null,
      onProgress: (current, total) => setProgress({ current, total }),
    })

    if (config.afterImport) {
      try { await config.afterImport(res, willImport) } catch { /* linkage is best-effort */ }
    }

    setResult(res)
    setImporting(false)
    onImported?.() // ONE refresh for the whole run — never per-row
  }

  function renderBadges(row, badgeFlags, isFirstCol = false) {
    const present = [...row._flags, ...row._warnings].filter(f =>
      badgeFlags?.includes(f) || (isFirstCol && f === 'low_confidence')
    )
    return present.map(f => {
      const labelKey = config.flagLabels?.[f] ?? (f === 'low_confidence' ? 'import:badgeLowConfidence' : null)
      return labelKey ? <span key={f} className={styles.warnBadge}>{t(labelKey)}</span> : null
    })
  }

  function dispositionLabel(row) {
    if (row._disposition === 'update') return t('import:dispositionUpdate')
    if (rowSkips(row)) return t('import:dispositionSkip')
    return t('import:dispositionNew')
  }

  // ── Render ──────────────────────────────────────────────────

  const STEPS = ['import:stepUpload', 'import:stepMap', 'import:stepReview', 'import:stepImport']
  const { MapExtras, ReviewExtras } = config
  const showModes = !!config.modes && !!config.matchExisting

  const MODE_OPTIONS = [
    { value: 'add', labelKey: 'import:modeAdd' },
    { value: 'update', labelKey: 'import:modeUpdate' },
    { value: 'both', labelKey: 'import:modeBoth' },
  ]

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

          {showModes && (
            <div style={{ margin: '12px 0' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('import:modeLabel')}
              </label>
              <div className={styles.typeToggle}>
                {MODE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.typeBtn} ${mode === opt.value ? styles.typeBtnActive : ''}`}
                    onClick={() => setMode(opt.value)}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

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

            {docMode && showModes && (
              <div style={{ margin: '12px 0' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t('import:modeLabel')}
                </label>
                <div className={styles.typeToggle}>
                  {MODE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`${styles.typeBtn} ${mode === opt.value ? styles.typeBtnActive : ''}`}
                      onClick={() => setMode(opt.value)}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ReviewExtras && <ReviewExtras ctx={ctx} setCtx={setCtx} t={t} />}

            <div className={styles.previewWrap} style={{ maxHeight: 300 }}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    {showModes && <th>{t('import:colDisposition')}</th>}
                    {config.reviewColumns.map(col => <th key={col.key}>{t(col.labelKey)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {all.map((row, i) => (
                    <tr key={i} className={rowSkips(row) ? styles.skipRow : ''}>
                      {showModes && (
                        <td style={{ fontWeight: 600 }}>{dispositionLabel(row)}</td>
                      )}
                      {config.reviewColumns.map((col, colIdx) => (
                        <td key={col.key}>
                          {config.editableReview && col.editKey ? (
                            <input
                              className={styles.mappingSelect}
                              style={{ minWidth: 70, padding: '3px 6px', fontSize: 12 }}
                              value={edits[row._index]?.[col.editKey] ?? (docMode ? (initialRows[row._index]?.[col.editKey] ?? '') : '')}
                              onChange={e => setEdits(prev => ({
                                ...prev,
                                [row._index]: { ...prev[row._index], [col.editKey]: e.target.value },
                              }))}
                            />
                          ) : (
                            col.render(row, t)
                          )}
                          {renderBadges(row, col.badges, colIdx === 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.actions}>
              {!docMode && (
                <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setStep(1)}>{t('common:action.back')}</button>
              )}
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
              {(result.updated?.length ?? 0) > 0 && (
                <div className={styles.resultList}>
                  <strong>{t('import:updatedCount', { count: result.updated.length })}</strong>
                  {result.updated.slice(0, 10).map((u, i) => (
                    <div key={i} className={styles.resultItem}>{u.name}</div>
                  ))}
                  {result.updated.length > 10 && <div className={styles.resultItem}>{t('import:andMore', { count: result.updated.length - 10 })}</div>}
                </div>
              )}
              {(result.created?.length ?? 0) > 0 && (
                <div className={styles.resultList}>
                  <strong>{t('import:createdCount', { count: result.created.length })}</strong>
                  {result.created.slice(0, 10).map((c, i) => (
                    <div key={i} className={styles.resultItem}>
                      {t(c.type === 'client' ? 'import:createdClient' : c.type === 'crew' ? 'import:createdCrew' : 'import:createdJob')}: {c.name}
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
