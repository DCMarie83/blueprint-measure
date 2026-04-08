import { useState } from 'react'
import styles from './ZoneDrawPanel.module.css'

// The panel shown during active drawing.
// User picks measurement type, names the zone, then clicks "Start Drawing".
export default function ZoneDrawPanel({ onStart, onCancel, isDrawing, pointCount, onFinish }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('SF')

  function handleStart(e) {
    e.preventDefault()
    if (!name.trim()) return
    onStart({ name: name.trim(), type })
  }

  if (isDrawing) {
    return (
      <div className={styles.panel}>
        <div className={styles.status}>
          <div className={styles.dot} />
          Drawing zone — {pointCount} {pointCount === 1 ? 'point' : 'points'} placed
        </div>
        <p className={styles.hint}>
          {type === 'count'
            ? 'Click to place each item. Click Finish when done.'
            : type === 'LF'
            ? 'Click to trace the line. Double-click or Finish to close.'
            : 'Click to draw polygon corners. Double-click or Finish to close.'}
        </p>
        <div className={styles.actions}>
          <button className={styles.finishBtn} onClick={onFinish} disabled={pointCount < (type === 'count' ? 1 : 2)}>
            Finish Zone
          </button>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <form className={styles.panel} onSubmit={handleStart}>
      <div className={styles.field}>
        <label>Zone Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Living Room, Door Frames…"
          required
        />
      </div>

      <div className={styles.field}>
        <label>Measurement Type</label>
        <div className={styles.typeGroup}>
          {['SF', 'LF', 'count'].map(t => (
            <button
              key={t}
              type="button"
              className={`${styles.typeBtn} ${type === t ? styles.active : ''}`}
              onClick={() => setType(t)}
            >
              <span className={styles.typeBtnLabel}>{t}</span>
              <span className={styles.typeBtnDesc}>
                {t === 'SF' ? 'Area' : t === 'LF' ? 'Length' : 'Count'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className={styles.startBtn}>Start Drawing</button>
    </form>
  )
}
