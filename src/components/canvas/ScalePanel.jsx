import { useState } from 'react'
import { SCALE_OPTIONS, calcPixelsPerFoot } from '../../utils/scaleOptions'
import styles from './ScalePanel.module.css'

// ScalePanel lets the user set the blueprint's scale.
// Either pick from the standard dropdown, or use manual calibration
// (draw a line of known length on the blueprint).
export default function ScalePanel({ pixelsPerFoot, onScaleChange, onStartCalibration, calibrating }) {
  const [selected, setSelected] = useState('1/4')
  const [knownFeet, setKnownFeet] = useState('')

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
    </div>
  )
}
