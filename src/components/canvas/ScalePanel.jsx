import { useState, useEffect } from 'react'
import { SCALE_OPTIONS, calcPixelsPerFoot } from '../../utils/scaleOptions'
import styles from './ScalePanel.module.css'

// ScalePanel lets the user set the blueprint's scale.
// Either pick from the standard dropdown, or use manual calibration
// (draw a line of known length on the blueprint).
export default function ScalePanel({ pixelsPerFoot, onScaleChange, onStartCalibration, calibrating }) {
  const [selected, setSelected] = useState('1/4')
  const [knownFeet, setKnownFeet] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)

  // Fire the default scale immediately on mount so the parent knows a scale
  // is active without the user having to touch the dropdown first.
  // This fixes sessions that reload with a blueprint already set — the
  // zone draw panel would stay hidden because pixelsPerFoot was never pushed.
  useEffect(() => {
    const defaultOption = SCALE_OPTIONS.find(o => o.value === '1/4')
    if (defaultOption?.inchesPerFoot) {
      onScaleChange(calcPixelsPerFoot(defaultOption.inchesPerFoot))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once on mount only

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
    const feet = parseFloat(knownFeet)
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
              type="number"
              min="0.1"
              step="0.1"
              placeholder="Known length (feet)"
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
