import { useState, useEffect, useRef } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { SCALE_OPTIONS, calcPixelsPerFoot } from '../../utils/scaleOptions'
import { parseFeetInches } from '../../utils/fractions'
import { BRAND } from '../../lib/config'
import styles from './ScalePanel.module.css'

export default function ScalePanel({ pixelsPerFoot, pixelsPerInch = 96, pdfPageInfo, currentPage, pageCount,
  isSuperAdmin = false, isPdf = false, onScaleChange, onStartCalibration, calibrating, pageKey,
  enabledFeatures = {}, onDetectScale, scaleSanity, scaleDetectionBanner,
  hasZonesOnPage = false, onRescaleZones }) {
  const { t } = useTranslation()
  // Notation labels are literal symbols; only the 'manual' option label is a t() key.
  const scaleOptLabel = (o) => o.value === 'manual' ? t(o.label) : o.label
  const [selected, setSelected] = useState('1/4')
  const [knownFeet, setKnownFeet] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const infoRef = useRef(null)

  // ── Sync dropdown to actual pixelsPerFoot (e.g. after Cancel reverts scale) ─
  useEffect(() => {
    if (!pixelsPerFoot) return
    const match = SCALE_OPTIONS.find(o => {
      if (!o.inchesPerFoot) return false
      return Math.abs(calcPixelsPerFoot(o.inchesPerFoot, pixelsPerInch) - pixelsPerFoot) < 0.5
    })
    if (match) setSelected(match.value)
    else if (selected !== 'manual') setSelected('manual')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelsPerFoot, pixelsPerInch])

  // ── Recalculate when pixelsPerInch changes from fallback to real ────────────
  // On PDF load the sequence is: mount → default fires with pixelsPerInch=96 →
  // PDF renders → pixelsPerInch updates to real value (e.g. 108). At that point
  // pixelsPerFoot is already set (to the wrong 96-based value). This effect
  // detects the transition and recalculates using the dropdown selection.
  useEffect(() => {
    if (pixelsPerInch === 96) return // still fallback, nothing to fix
    if (!pixelsPerFoot) return       // no scale set yet
    const option = SCALE_OPTIONS.find(o => o.value === selected)
    if (!option?.inchesPerFoot) return // manual calibration — don't override
    const correct = calcPixelsPerFoot(option.inchesPerFoot, pixelsPerInch)
    if (Math.abs(pixelsPerFoot - correct) > 0.01) {
      onScaleChange(correct)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelsPerInch])

  function handleSelect(value) {
    setSelected(value)
    if (value !== 'manual') {
      const option = SCALE_OPTIONS.find(o => o.value === value)
      if (option) {
        const ppf = calcPixelsPerFoot(option.inchesPerFoot, pixelsPerInch)
        onScaleChange(ppf)
      }
    }
  }

  function handleCalibrationStart(e) {
    e.preventDefault()
    const feet = parseFeetInches(knownFeet)
    if (!feet || feet <= 0) return
    onStartCalibration(feet)
  }

  // Find the selected option for the diagnostic display
  const selectedOption = SCALE_OPTIONS.find(o => o.value === selected)
  const expectedPpf = selectedOption?.inchesPerFoot
    ? calcPixelsPerFoot(selectedOption.inchesPerFoot, pixelsPerInch)
    : null
  const hasMismatch = expectedPpf != null && pixelsPerFoot != null &&
    selected !== 'manual' && Math.abs(pixelsPerFoot - expectedPpf) > 0.01

  return (
    <div className={styles.panel}>
      <div className={styles.label}>{t('blueprint:scalePanel.blueprintScale')}</div>

      <select
        className={styles.select}
        value={selected}
        onChange={e => handleSelect(e.target.value)}
      >
        {SCALE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{scaleOptLabel(o)}</option>
        ))}
      </select>

      {selected === 'manual' && (
        <form className={styles.calibForm} onSubmit={handleCalibrationStart}>
          <p className={styles.calibHint}>
            {t('blueprint:scalePanel.calibHint')}
          </p>
          <div className={styles.calibRow}>
            <input
              type="text"
              placeholder={t('blueprint:scalePanel.knownDistancePlaceholder')}
              value={knownFeet}
              onChange={e => setKnownFeet(e.target.value)}
              className={styles.calibInput}
              required
            />
            <button
              type="submit"
              className={`${styles.calibBtn} ${calibrating ? styles.calibActive : ''}`}
            >
              {calibrating ? t('blueprint:scalePanel.clickTwoPoints') : t('blueprint:scalePanel.setCalibLine')}
            </button>
          </div>
        </form>
      )}

      {pixelsPerFoot && (
        <div className={styles.activeScale}>
          {t('blueprint:scalePanel.scaleActive', { px: (pixelsPerFoot).toFixed(1) })}
        </div>
      )}

      {pixelsPerFoot && hasZonesOnPage && onRescaleZones && (
        <button type="button" className={styles.rescaleBtn} onClick={onRescaleZones}>
          {t('blueprint:scalePanel.rescaleExisting')}
        </button>
      )}

      {/* ── Scale notice pill (standard users only) ── */}
      {!isSuperAdmin && pixelsPerFoot && (() => {
        const sanityFail = scaleSanity && !scaleSanity.passes
        const pdfMissing = isPdf && !pdfPageInfo
        const pillColor = pdfMissing ? 'red' : sanityFail ? 'amber' : 'green'
        return (
          <div className={`${styles.scalePill} ${styles[`scalePill_${pillColor}`]}`}>
            <span className={styles.scalePillText}>
              {pdfMissing
                ? t('blueprint:scalePanel.pillPdfMissing')
                : sanityFail
                ? t('blueprint:scalePanel.pillMayNotMatch')
                : t('blueprint:scalePanel.pillScaleSet', { label: selectedOption ? scaleOptLabel(selectedOption) : selected })}
            </span>
            {!pdfMissing && (
              <button type="button" className={styles.scalePillInfo}
                onClick={() => setInfoOpen(o => !o)}>ⓘ</button>
            )}
            {sanityFail && !pdfMissing && (
              <div className={styles.scalePillHelper}>
                {t('blueprint:scalePanel.pillHelper')}
              </div>
            )}
            {infoOpen && (
              <div className={styles.scalePillPopover} ref={infoRef}>
                <div className={styles.scalePillPopTitle}>{t('blueprint:scalePanel.howScaleWorksTitle')}</div>
                <p className={styles.scalePillPopBody}>
                  {t('blueprint:scalePanel.howScaleWorksBody', { brand: BRAND.name })}
                </p>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Scale diagnostic (super admin only) ── */}
      {isSuperAdmin && pixelsPerFoot && (
        <div className={styles.diagnostic}>
          <div><span className={styles.diagLabel}>{t('blueprint:scalePanel.diagSource')}</span> {pixelsPerInch !== 96 ? t('blueprint:scalePanel.diagPdfMetadata') : t('blueprint:scalePanel.diagFallback96')}</div>
          <div><span className={styles.diagLabel}>{t('blueprint:scalePanel.diagRender')}</span> {pixelsPerInch.toFixed(1)} px/inch</div>
          {selectedOption?.inchesPerFoot && (
            <div><span className={styles.diagLabel}>{t('blueprint:scalePanel.diagScale')}</span> {selectedOption.label} ({selectedOption.inchesPerFoot} in/ft)</div>
          )}
          {expectedPpf != null && (
            <div><span className={styles.diagLabel}>{t('blueprint:scalePanel.diagCalc')}</span> {pixelsPerInch.toFixed(1)} × {selectedOption.inchesPerFoot} = {expectedPpf.toFixed(1)} px/ft</div>
          )}
          <div><span className={styles.diagLabel}>{t('blueprint:scalePanel.diagStored')}</span> {pixelsPerFoot.toFixed(1)} px/ft</div>
          {hasMismatch && (
            <div className={styles.diagMismatch}>{t('blueprint:scalePanel.diagMismatch')}</div>
          )}
        </div>
      )}

      {/* Pixel sanity check results — shown for ALL users */}
      {scaleSanity && scaleSanity.passes && scaleSanity.source === 'calibration' && (
        <div className={styles.sanityPass}>
          {t('blueprint:scalePanel.sanityCalibrated', { widthFt: scaleSanity.widthFt, heightFt: scaleSanity.heightFt })}
        </div>
      )}
      {scaleSanity && !scaleSanity.passes && (
        <div className={styles.sanityWarn}>
          {t('blueprint:scalePanel.sanityWarn', { widthFt: scaleSanity.widthFt, heightFt: scaleSanity.heightFt })}
        </div>
      )}

      {/* AI detection result banner */}
      {scaleDetectionBanner && scaleDetectionBanner.verified === true && (
        <div className={styles.sanityPass}>
          {t('blueprint:scalePanel.aiVerified', { label: scaleDetectionBanner.label })}
        </div>
      )}
      {scaleDetectionBanner && scaleDetectionBanner.verified === false && (
        <div className={styles.sanityWarn}>
          {t('blueprint:scalePanel.aiUnverified', { label: scaleDetectionBanner.label })}
        </div>
      )}

      {/* ── Confirm PDF Scale button (super admin only) ── */}
      {isSuperAdmin && (
        <>
        <button
          type="button"
          className={styles.confirmBtn}
          onClick={() => setConfirmOpen(o => !o)}
        >
          {confirmOpen ? t('common:action.close') : t('blueprint:scalePanel.confirmPdfScale')}
        </button>

      {confirmOpen && (
        <div className={styles.confirmPanel}>
          {pdfPageInfo ? (
            <>
              <div className={styles.confirmRow}>
                <span className={styles.diagLabel}>{t('blueprint:scalePanel.confirmPage')}</span> {t('blueprint:scalePanel.pageOf', { current: currentPage, total: pageCount })}
              </div>
              <div className={styles.confirmRow}>
                <span className={styles.diagLabel}>{t('blueprint:scalePanel.confirmPhysical')}</span> {pdfPageInfo.widthInches.toFixed(2)}" × {pdfPageInfo.heightInches.toFixed(2)}"
              </div>
              <div className={styles.confirmRow}>
                <span className={styles.diagLabel}>{t('blueprint:scalePanel.confirmRenderedAt')}</span> {t('blueprint:scalePanel.pixelsPerInch', { ppi: pdfPageInfo.pixelsPerInch.toFixed(1) })}
              </div>
              <div className={styles.confirmTableLabel}>{t('blueprint:scalePanel.scaleRefTable')}</div>
              <table className={styles.confirmTable}>
                <thead>
                  <tr><th>{t('blueprint:scalePanel.thScale')}</th><th>in/ft</th><th>px/ft</th></tr>
                </thead>
                <tbody>
                  {SCALE_OPTIONS.filter(o => o.value !== 'manual').map(o => (
                    <tr key={o.value} className={o.value === selected ? styles.confirmTableActive : ''}>
                      <td>{o.label}</td>
                      <td>{o.inchesPerFoot}</td>
                      <td>{calcPixelsPerFoot(o.inchesPerFoot, pdfPageInfo.pixelsPerInch).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className={styles.confirmError}>
              {t('blueprint:scalePanel.confirmNoMetadata')}
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* AI scale detection — only for Plus+ */}
      {enabledFeatures.ai_scale_detection ? (
        <div className={styles.aiSection}>
          <button
            type="button"
            className={styles.aiBtn}
            disabled={detecting}
            onClick={async () => {
              if (!onDetectScale) return
              setDetecting(true)
              try {
                await onDetectScale()
              } finally {
                setDetecting(false)
              }
            }}
          >
            {detecting ? t('blueprint:scalePanel.detecting') : t('blueprint:scalePanel.aiDetectScale')}
          </button>
          <p className={styles.aiHint}>
            {t('blueprint:scalePanel.aiHint')}
          </p>
        </div>
      ) : (
        <div className={styles.aiLocked}>
          {t('blueprint:scalePanel.aiLocked')}
        </div>
      )}

      {/* Collapsible help section */}
      <div className={styles.helpSection}>
        <button
          type="button"
          className={styles.helpToggle}
          onClick={() => setHelpOpen(o => !o)}
        >
          <span className={styles.helpIcon}>?</span>
          {t('blueprint:scalePanel.howToSetScale')}
          <span className={styles.helpArrow}>{helpOpen ? '▲' : '▼'}</span>
        </button>

        {helpOpen && (
          <div className={styles.helpBody}>
            <div className={styles.helpOption}>
              <div className={styles.helpOptionLabel}>{t('blueprint:scalePanel.helpManualLabel')}</div>
              <p className={styles.helpOptionText}>
                <Trans i18nKey="blueprint:scalePanel.helpManualText">
                Find any printed dimension on the drawing (e.g. a wall labeled 24'-0"). Enter that
                distance, click <strong>Set Calibration Line</strong>, then click both endpoints
                of that dimension on the blueprint. Scale is set exactly.
                </Trans>
              </p>
            </div>

            {enabledFeatures.ai_scale_detection && (
              <div className={styles.helpOption}>
                <div className={styles.helpOptionLabel}>{t('blueprint:scalePanel.helpAiLabel')}</div>
                <p className={styles.helpOptionText}>
                  <Trans i18nKey="blueprint:scalePanel.helpAiText">
                  Click <strong>AI Detect Scale</strong> above. AI reads the title block and applies
                  the scale. Verified automatically with a dimension check.
                  </Trans>
                </p>
              </div>
            )}

            <div className={styles.helpOption}>
              <div className={styles.helpOptionLabel}>{t('blueprint:scalePanel.helpDropdownLabel')}</div>
              <p className={styles.helpOptionText}>
                {t('blueprint:scalePanel.helpDropdownText')}
              </p>
            </div>

            <div className={styles.helpTip}>
              {t('blueprint:scalePanel.helpTip')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
