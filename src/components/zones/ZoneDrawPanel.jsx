import { useState } from 'react'
import styles from './ZoneDrawPanel.module.css'

const SURFACE_TYPES = ['Wall', 'Ceiling', 'Trim', 'Door', 'Window', 'Cabinet', 'Floor', 'Exterior', 'Other']

// The panel shown during active drawing.
// User picks measurement type, names the zone, then clicks "Start Drawing".
//
// drawingType — when passed from the parent (redraw mode), overrides the local
//               type state so the drawing-status UI reflects the real zone type.
// sfPreview   — { flat, adjusted, adjustment } computed by SessionPage in real-time
//               from the points the contractor has placed so far. Only present when
//               surface type is Ceiling and ceiling type is not Flat.
export default function ZoneDrawPanel({ onStart, onCancel, isDrawing, pointCount, onFinish, drawingType, sfPreview }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [surfaceType, setSurfaceType] = useState('')
  const [coatCount, setCoatCount] = useState(1)
  const [type, setType] = useState('SF')

  // Ceiling-specific fields — only used when surfaceType === 'Ceiling'
  const [ceilingType, setCeilingType] = useState('flat')
  const [ceilingPeakHeight, setCeilingPeakHeight] = useState('')
  const [ceilingWallHeight, setCeilingWallHeight] = useState('')
  const [ceilingTrayPerimeter, setCeilingTrayPerimeter] = useState('')
  const [ceilingDropDepth, setCeilingDropDepth] = useState('')
  const [ceilingLowWallHeight, setCeilingLowWallHeight] = useState('')
  const [ceilingHighWallHeight, setCeilingHighWallHeight] = useState('')

  function handleStart(e) {
    e.preventDefault()
    if (!name.trim()) return
    const isCeiling = surfaceType === 'Ceiling'
    onStart({
      name: name.trim(),
      description: description.trim() || null,
      surface_type: surfaceType || null,
      coat_count: coatCount,
      type,
      ceiling_type: isCeiling ? ceilingType : null,
      ceiling_peak_height:    isCeiling && ceilingType === 'vaulted' ? parseFloat(ceilingPeakHeight)    || null : null,
      ceiling_wall_height:    isCeiling && ceilingType === 'vaulted' ? parseFloat(ceilingWallHeight)    || null : null,
      ceiling_tray_perimeter: isCeiling && ceilingType === 'tray'    ? parseFloat(ceilingTrayPerimeter) || null : null,
      ceiling_drop_depth:     isCeiling && ceilingType === 'tray'    ? parseFloat(ceilingDropDepth)     || null : null,
      ceiling_low_wall_height:  isCeiling && ceilingType === 'shed'  ? parseFloat(ceilingLowWallHeight)  || null : null,
      ceiling_high_wall_height: isCeiling && ceilingType === 'shed'  ? parseFloat(ceilingHighWallHeight) || null : null,
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

        {/* Real-time ceiling SF preview — only shown when enough points are placed */}
        {sfPreview && (
          <div className={styles.sfPreview}>
            <div className={styles.sfPreviewRow}>
              <span className={styles.sfPreviewLabel}>Flat footprint</span>
              <span className={styles.sfPreviewValue}>{sfPreview.flat} sq ft</span>
            </div>
            <div className={styles.sfPreviewRow}>
              <span className={styles.sfPreviewLabel}>Adjusted ceiling</span>
              <span className={styles.sfPreviewValueHighlight}>{sfPreview.adjusted} sq ft</span>
            </div>
            {sfPreview.adjustment !== 0 && (
              <div className={styles.sfPreviewAdj}>
                {sfPreview.adjustment > 0 ? '+' : ''}{sfPreview.adjustment} sq ft for slope
              </div>
            )}
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

      {/* Ceiling type selector — only shown when surface type is Ceiling */}
      {surfaceType === 'Ceiling' && (
        <div className={styles.field}>
          <label>Ceiling Type</label>
          <select
            className={styles.select}
            value={ceilingType}
            onChange={e => setCeilingType(e.target.value)}
          >
            <option value="flat">Flat (standard)</option>
            <option value="vaulted">Vaulted / Cathedral</option>
            <option value="tray">Tray / Coffered</option>
            <option value="shed">Shed / Single slope</option>
          </select>
        </div>
      )}

      {/* Vaulted fields — peak height and wall (eave) height */}
      {surfaceType === 'Ceiling' && ceilingType === 'vaulted' && (
        <div className={styles.field}>
          <label>Vault Heights</label>
          <div className={styles.heightRow}>
            <div className={styles.heightField}>
              <label>Peak height (ft)</label>
              <input
                type="number" min="0" step="0.5"
                value={ceilingPeakHeight}
                onChange={e => setCeilingPeakHeight(e.target.value)}
                placeholder="e.g. 14"
              />
            </div>
            <div className={styles.heightField}>
              <label>Wall height (ft)</label>
              <input
                type="number" min="0" step="0.5"
                value={ceilingWallHeight}
                onChange={e => setCeilingWallHeight(e.target.value)}
                placeholder="e.g. 8"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tray / Coffered fields — tray perimeter and drop depth */}
      {surfaceType === 'Ceiling' && ceilingType === 'tray' && (
        <div className={styles.field}>
          <label>Tray Details</label>
          <div className={styles.heightRow}>
            <div className={styles.heightField}>
              <label>Tray perimeter (ft)</label>
              <input
                type="number" min="0" step="0.5"
                value={ceilingTrayPerimeter}
                onChange={e => setCeilingTrayPerimeter(e.target.value)}
                placeholder="e.g. 24"
              />
            </div>
            <div className={styles.heightField}>
              <label>Drop depth (in)</label>
              <input
                type="number" min="0" step="0.25"
                value={ceilingDropDepth}
                onChange={e => setCeilingDropDepth(e.target.value)}
                placeholder="e.g. 6"
              />
            </div>
          </div>
        </div>
      )}

      {/* Shed / Single slope fields — low and high wall heights */}
      {surfaceType === 'Ceiling' && ceilingType === 'shed' && (
        <div className={styles.field}>
          <label>Shed Heights</label>
          <div className={styles.heightRow}>
            <div className={styles.heightField}>
              <label>Low wall (ft)</label>
              <input
                type="number" min="0" step="0.5"
                value={ceilingLowWallHeight}
                onChange={e => setCeilingLowWallHeight(e.target.value)}
                placeholder="e.g. 8"
              />
            </div>
            <div className={styles.heightField}>
              <label>High wall (ft)</label>
              <input
                type="number" min="0" step="0.5"
                value={ceilingHighWallHeight}
                onChange={e => setCeilingHighWallHeight(e.target.value)}
                placeholder="e.g. 12"
              />
            </div>
          </div>
        </div>
      )}

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
