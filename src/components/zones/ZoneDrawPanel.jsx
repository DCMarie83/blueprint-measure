import { useState } from 'react'
import styles from './ZoneDrawPanel.module.css'

const SURFACE_TYPES = ['Wall', 'Ceiling', 'Trim', 'Door', 'Window', 'Cabinet', 'Floor', 'Exterior', 'Other']

// The panel shown during active drawing.
// User picks measurement type, names the zone, then clicks "Start Drawing".
//
// drawingType — when passed from the parent (redraw mode), overrides the local
//               type state so the drawing-status UI reflects the real zone type.
export default function ZoneDrawPanel({ onStart, onCancel, isDrawing, pointCount, onFinish, drawingType }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [surfaceType, setSurfaceType] = useState('')
  const [coatCount, setCoatCount] = useState(1)
  const [type, setType] = useState('SF')

  function handleStart(e) {
    e.preventDefault()
    if (!name.trim()) return
    onStart({
      name: name.trim(),
      description: description.trim() || null,
      surface_type: surfaceType || null,
      coat_count: coatCount,
      type,
    })
  }

  // During drawing, use the type passed from the parent if available
  // (covers redraw mode where the form was never shown).
  const activeType = drawingType ?? type

  if (isDrawing) {
    return (
      <div className={styles.panel}>
        <div className={styles.status}>
          <div className={styles.dot} />
          {activeType === 'count'
            ? `${pointCount} ${pointCount === 1 ? 'item' : 'items'} placed`
            : `Drawing zone — ${pointCount} ${pointCount === 1 ? 'point' : 'points'} placed`}
        </div>
        {activeType === 'count' && (
          <div className={styles.countDisplay}>
            <span className={styles.countNumber}>{pointCount}</span>
            <span className={styles.countLabel}>items counted</span>
          </div>
        )}
        <p className={styles.hint}>
          {activeType === 'count'
            ? 'Click each item on the blueprint to count it. Click Finish Zone when done.'
            : activeType === 'LF'
            ? 'Click to trace the line. Double-click or Finish to close.'
            : 'Click to draw polygon corners. Double-click or Finish to close.'}
        </p>
        <div className={styles.actions}>
          <button className={styles.finishBtn} onClick={onFinish} disabled={pointCount < (activeType === 'count' ? 1 : 2)}>
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
        <label>Description <span className={styles.optional}>(optional)</span></label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Right wall, Windows…"
        />
      </div>

      <div className={styles.field}>
        <label>Surface Type <span className={styles.optional}>(optional)</span></label>
        <select
          className={styles.select}
          value={surfaceType}
          onChange={e => setSurfaceType(e.target.value)}
        >
          <option value="">Not specified</option>
          {SURFACE_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label>Number of Coats</label>
        <div className={styles.coatGroup}>
          {[1, 2].map(n => (
            <button
              key={n}
              type="button"
              className={`${styles.coatBtn} ${coatCount === n ? styles.active : ''}`}
              onClick={() => setCoatCount(n)}
            >
              {n} {n === 1 ? 'coat' : 'coats'}
            </button>
          ))}
        </div>
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
