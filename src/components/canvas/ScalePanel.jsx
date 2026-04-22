import { useState, useEffect } from 'react'
import { SCALE_OPTIONS, calcPixelsPerFoot } from '../../utils/scaleOptions'
import { parseFeetInches } from '../../utils/fractions'
import styles from './ScalePanel.module.css'

// ScalePanel lets the user set the blueprint's scale.
// Either pick from the standard dropdown, or use manual calibration
// (draw a line of known length on the blueprint).
export default function ScalePanel({ pixelsPerFoot, onScaleChange, onStartCalibration, calibrating, pageKey, enabledFeatures = {}, onDetectScale }) {
  const [selected, setSelected] = useState('1/4')
  const [knownFeet, setKnownFeet] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [detecting, setDetecting] = useState(false)

  // When the active page changes (or on first mount), apply the default 1/4" scale
  // only if this page has no saved scale yet. When pixelsPerFoot is already set
  // (the page has a persisted scale), we leave it alone — the badge will reflect it.
  useEffect(() => {
    if (!pixelsPerFoot) {
      const defaultOption = SCALE_OPTIONS.find(o => o.value === '1/4')
      if (defaultOption?.inchesPerFoot) {
        setSelected('1/4')
        onScaleChange(calcPixelsPerFoot(defaultOption.inchesPerFoot))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]) // Re-runs when the user switches pages

  function handleSelect(value) {
    setSelected(value)
    if (value !== 'manual') {
      const option = SCALE_OPTIONS.find(o => o.value === value)
      if (option) {
        const ppf = calcPixelsPerFoot(option.inchesPerFoot)
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
              <div className={styles.helpOptionLabel}>Option A — Use the dropdown</div>
              <p className={styles.helpOptionText}>
                If you know the blueprint scale (e.g. 1/4 inch = 1 foot), select it from the
                dropdown above. This is printed on most architectural blueprints in the title
                block or corner.
              </p>
            </div>

            <div className={styles.helpOption}>
              <div className={styles.helpOptionLabel}>Option B — Manual calibration</div>
              <p className={styles.helpOptionText}>
                If you are unsure of the scale, find any dimension printed on the blueprint —
                like a wall labeled 20 ft. Enter that number, click{' '}
                <strong>Set Calibration Line</strong>, then click both ends of that dimension
                on the blueprint.
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
