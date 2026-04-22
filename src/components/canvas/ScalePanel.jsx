import { useState, useEffect } from 'react'
import { SCALE_OPTIONS, calcPixelsPerFoot } from '../../utils/scaleOptions'
import { parseFeetInches } from '../../utils/fractions'
import styles from './ScalePanel.module.css'

export default function ScalePanel({ pixelsPerFoot, pixelsPerInch = 96, pdfPageInfo, currentPage, pageCount,
  onScaleChange, onStartCalibration, calibrating, pageKey,
  enabledFeatures = {}, onDetectScale, scaleSanity, scaleDetectionBanner }) {
  const [selected, setSelected] = useState('1/4')
  const [knownFeet, setKnownFeet] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // ── Default scale on page mount ────────────────────────────────────────────
  // Apply 1/4" default only when NO scale is set for this page.
  useEffect(() => {
    if (!pixelsPerFoot) {
      const defaultOption = SCALE_OPTIONS.find(o => o.value === '1/4')
      if (defaultOption?.inchesPerFoot) {
        setSelected('1/4')
        onScaleChange(calcPixelsPerFoot(defaultOption.inchesPerFoot, pixelsPerInch))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, pixelsPerInch])

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
      console.log('[ScalePanel] pixelsPerInch changed, recalculating', { selected, old: pixelsPerFoot, correct, pixelsPerInch })
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
        console.log('[ScalePanel] scale selected', { value, inchesPerFoot: option.inchesPerFoot, pixelsPerInch, calculatedPpf: ppf })
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
      <div className={styles.label}>Blueprint Scale</div>

      <select
        className={styles.select}
        value={selected}
        onChange={e => handleSelect(e.target.value)}
      >
        {SCALE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {selected === 'manual' && (
        <form className={styles.calibForm} onSubmit={handleCalibrationStart}>
          <p className={styles.calibHint}>
            Enter a known distance on the blueprint, then click two points that span that distance.
          </p>
          <div className={styles.calibRow}>
            <input
              type="text"
              placeholder="e.g. 12'6&quot; or 15"
              value={knownFeet}
              onChange={e => setKnownFeet(e.target.value)}
              className={styles.calibInput}
              required
            />
            <button
              type="submit"
              className={`${styles.calibBtn} ${calibrating ? styles.calibActive : ''}`}
            >
              {calibrating ? '…Click 2 points' : 'Set Calibration Line'}
            </button>
          </div>
        </form>
      )}

      {pixelsPerFoot && (
        <div className={styles.activeScale}>
          Scale active — 1 ft = {(pixelsPerFoot).toFixed(1)} px
        </div>
      )}

      {/* ── Always-on scale diagnostic ── */}
      {pixelsPerFoot && (
        <div className={styles.diagnostic}>
          <div><span className={styles.diagLabel}>Source:</span> {pixelsPerInch !== 96 ? 'PDF metadata' : 'Fallback 96 DPI (non-PDF or metadata not loaded)'}</div>
          <div><span className={styles.diagLabel}>Render:</span> {pixelsPerInch.toFixed(1)} px/inch</div>
          {selectedOption?.inchesPerFoot && (
            <div><span className={styles.diagLabel}>Scale:</span> {selectedOption.label} ({selectedOption.inchesPerFoot} in/ft)</div>
          )}
          {expectedPpf != null && (
            <div><span className={styles.diagLabel}>Calc:</span> {pixelsPerInch.toFixed(1)} × {selectedOption.inchesPerFoot} = {expectedPpf.toFixed(1)} px/ft</div>
          )}
          <div><span className={styles.diagLabel}>Stored:</span> {pixelsPerFoot.toFixed(1)} px/ft</div>
          {hasMismatch && (
            <div className={styles.diagMismatch}>MISMATCH — scale state is stale, refresh the scale dropdown.</div>
          )}
        </div>
      )}

      {/* Pixel sanity check results — shown for ALL users */}
      {scaleSanity && scaleSanity.passes && scaleSanity.source === 'calibration' && (
        <div className={styles.sanityPass}>
          ✓ Scale calibrated — {scaleSanity.widthFt}' × {scaleSanity.heightFt}' drawing
        </div>
      )}
      {scaleSanity && !scaleSanity.passes && (
        <div className={styles.sanityWarn}>
          Scale may be incorrect. At this scale the page measures {scaleSanity.widthFt}' × {scaleSanity.heightFt}'. Typical floor plans are 20–200 feet. Verify your scale or use manual calibration.
        </div>
      )}

      {/* AI detection result banner */}
      {scaleDetectionBanner && scaleDetectionBanner.verified === true && (
        <div className={styles.sanityPass}>
          ✓ Scale detected and verified — {scaleDetectionBanner.label}
        </div>
      )}
      {scaleDetectionBanner && scaleDetectionBanner.verified === false && (
        <div className={styles.sanityWarn}>
          AI detected {scaleDetectionBanner.label} but dimensions seem off. Try manual calibration.
        </div>
      )}

      {/* ── Confirm PDF Scale button (available to everyone) ── */}
      <button
        type="button"
        className={styles.confirmBtn}
        onClick={() => setConfirmOpen(o => !o)}
      >
        {confirmOpen ? 'Close' : 'Confirm PDF Scale'}
      </button>

      {confirmOpen && (
        <div className={styles.confirmPanel}>
          {pdfPageInfo ? (
            <>
              <div className={styles.confirmRow}>
                <span className={styles.diagLabel}>Page:</span> {currentPage} of {pageCount}
              </div>
              <div className={styles.confirmRow}>
                <span className={styles.diagLabel}>Physical:</span> {pdfPageInfo.widthInches.toFixed(2)}" × {pdfPageInfo.heightInches.toFixed(2)}"
              </div>
              <div className={styles.confirmRow}>
                <span className={styles.diagLabel}>Rendered at:</span> {pdfPageInfo.pixelsPerInch.toFixed(1)} pixels per physical inch
              </div>
              <div className={styles.confirmTableLabel}>Scale reference table:</div>
              <table className={styles.confirmTable}>
                <thead>
                  <tr><th>Scale</th><th>in/ft</th><th>px/ft</th></tr>
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
              PDF metadata not available. Falling back to 96 DPI. Measurements will be inaccurate until this is fixed.
            </div>
          )}
        </div>
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
            {detecting ? 'Detecting…' : 'AI Detect Scale'}
          </button>
          <p className={styles.aiHint}>
            AI reads your blueprint title block and sets the scale automatically.
          </p>
        </div>
      ) : (
        <div className={styles.aiLocked}>
          🔒 AI Scale Detection — available on Plus plan
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
          How to set scale
          <span className={styles.helpArrow}>{helpOpen ? '▲' : '▼'}</span>
        </button>

        {helpOpen && (
          <div className={styles.helpBody}>
            <div className={styles.helpOption}>
              <div className={styles.helpOptionLabel}>Most accurate — Manual calibration</div>
              <p className={styles.helpOptionText}>
                Find any printed dimension on the drawing (e.g. a wall labeled 24'-0"). Enter that
                distance, click <strong>Set Calibration Line</strong>, then click both endpoints
                of that dimension on the blueprint. Scale is set exactly.
              </p>
            </div>

            {enabledFeatures.ai_scale_detection && (
              <div className={styles.helpOption}>
                <div className={styles.helpOptionLabel}>Fast and accurate — AI Detection (Plus+)</div>
                <p className={styles.helpOptionText}>
                  Click <strong>AI Detect Scale</strong> above. AI reads the title block and applies
                  the scale. Verified automatically with a dimension check.
                </p>
              </div>
            )}

            <div className={styles.helpOption}>
              <div className={styles.helpOptionLabel}>Quick start — Dropdown selection</div>
              <p className={styles.helpOptionText}>
                Pick the scale stated on the drawing from the dropdown above. The system checks
                automatically that the resulting dimensions are reasonable.
              </p>
            </div>

            <div className={styles.helpTip}>
              Tip: For residential blueprints, 1/4 inch = 1 foot is the most common scale.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
