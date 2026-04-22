import { useState, useEffect } from 'react'
import { SCALE_OPTIONS, calcPixelsPerFoot } from '../../utils/scaleOptions'
import { parseFeetInches } from '../../utils/fractions'
import styles from './ScalePanel.module.css'

// ScalePanel lets the user set the blueprint's scale.
// Either pick from the standard dropdown, use manual calibration, or AI detection.
export default function ScalePanel({ pixelsPerFoot, pixelsPerInch = 96, onScaleChange, onStartCalibration, calibrating, pageKey,
  enabledFeatures = {}, onDetectScale, scaleSanity, scaleDetectionBanner }) {
  const [selected, setSelected] = useState('1/4')
  const [knownFeet, setKnownFeet] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [detecting, setDetecting] = useState(false)

  // When the active page changes (or on first mount), apply the default 1/4" scale
  // only if this page has no saved scale yet.
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

      {/* Render resolution info — confirms the math is grounded in reality */}
      {pixelsPerInch !== 96 && pixelsPerFoot && (
        <div className={styles.renderInfo}>
          Page renders at {Math.round(pixelsPerInch)} px/inch.
          {' '}At {SCALE_OPTIONS.find(o => calcPixelsPerFoot(o.inchesPerFoot, pixelsPerInch) === pixelsPerFoot)?.label ?? 'this scale'} = {pixelsPerFoot.toFixed(1)} px/ft.
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

      {/* AI scale detection */}
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
            {detecting ? 'Detecting…' : 'Detect Scale'}
          </button>
          <p className={styles.aiHint}>
            AI reads your blueprint title block and sets the scale automatically. Works best when the title block is visible on the current page.
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
                  Click <strong>Detect Scale</strong> above. AI reads the title block and applies
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
