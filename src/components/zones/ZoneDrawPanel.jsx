import { useState } from 'react'
import { parseFeetInches } from '../../utils/fractions'
import styles from './ZoneDrawPanel.module.css'

const SURFACE_TYPES = ['Wall', 'Ceiling', 'Trim', 'Door', 'Window', 'Cabinet', 'Floor', 'Exterior', 'Other']

// Preset color swatches for zone colors. null = use the auto-cycling palette.
const PRESET_COLORS = [
  '#2e8bff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
  '#8b5cf6', '#f43f5e', '#64748b', '#0ea5e9',
]

// The panel shown during active drawing.
// User picks measurement type, names the zone, then clicks "Start Drawing".
//
// drawingType — when passed from the parent (redraw mode), overrides the local
//               type state so the drawing-status UI reflects the real zone type.
// sfPreview   — { flat, adjusted, adjustment } computed by SessionPage in real-time
//               from the points the contractor has placed so far. Only present when
//               surface type is Ceiling and ceiling type is not Flat.
export default function ZoneDrawPanel({
  onStart, onCancel, onUndoPoint, onAddSegment, onFinalizeZone,
  isDrawing, isAccumulating, segmentCount = 0, accumulatedResult = 0,
  pointCount, onFinish, drawingType, sfPreview,
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [surfaceType, setSurfaceType] = useState('')
  const [coatCount, setCoatCount] = useState(1)
  const [type, setType] = useState('SF')
  const [color, setColor] = useState(null) // null = auto palette

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
      color: color ?? null,
      ceiling_type: isCeiling ? ceilingType : null,
      ceiling_peak_height:      isCeiling && ceilingType === 'vaulted' ? parseFeetInches(ceilingPeakHeight)    : null,
      ceiling_wall_height:      isCeiling && ceilingType === 'vaulted' ? parseFeetInches(ceilingWallHeight)    : null,
      ceiling_tray_perimeter:   isCeiling && ceilingType === 'tray'    ? parseFeetInches(ceilingTrayPerimeter) : null,
      ceiling_drop_depth:       isCeiling && ceilingType === 'tray'    ? parseFeetInches(ceilingDropDepth)     : null,
      ceiling_low_wall_height:  isCeiling && ceilingType === 'shed'    ? parseFeetInches(ceilingLowWallHeight)  : null,
      ceiling_high_wall_height: isCeiling && ceilingType === 'shed'    ? parseFeetInches(ceilingHighWallHeight) : null,
    })
  }

  // During drawing, use the type passed from the parent if available
  // (covers redraw mode where the form was never shown).
  const activeType = drawingType ?? type
  const unitLabel = activeType === 'LF' ? 'lin ft' : activeType === 'count' ? 'items' : activeType

  // ── Between-segment pause: segments finished, waiting for next action ─────────
  if (isAccumulating && !isDrawing) {
    return (
      <div className={styles.panel}>
        <div className={styles.status}>
          <div className={styles.dot} />
          {segmentCount} {segmentCount === 1 ? 'segment' : 'segments'} added
        </div>
        <div className={styles.accumTotal}>
          <span className={styles.accumLabel}>Running total</span>
          <span className={styles.accumValue}>{accumulatedResult} {unitLabel}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.finalizeBtn} onClick={onFinalizeZone}>
            Done — Save Zone
          </button>
          <button className={styles.addSegmentBtn} onClick={onAddSegment}>
            + Add Another Segment
          </button>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel All</button>
        </div>
      </div>
    )
  }

  // ── Active drawing (first segment or subsequent segments in accumulation mode) ─
  if (isDrawing) {
    return (
      <div className={styles.panel}>
        <div className={styles.status}>
          <div className={styles.dot} />
          {isAccumulating
            ? `Segment ${segmentCount + 1} — ${pointCount} ${pointCount === 1 ? 'point' : 'points'} placed`
            : activeType === 'count'
            ? `${pointCount} ${pointCount === 1 ? 'item' : 'items'} placed`
            : `Drawing zone — ${pointCount} ${pointCount === 1 ? 'point' : 'points'} placed`}
        </div>
        {activeType === 'count' && (
          <div className={styles.countDisplay}>
            <span className={styles.countNumber}>{pointCount}</span>
            <span className={styles.countLabel}>items counted</span>
          </div>
        )}

        {/* Running total shown while adding segments in accumulation mode */}
        {isAccumulating && segmentCount > 0 && (
          <div className={styles.accumTotal}>
            <span className={styles.accumLabel}>Added so far</span>
            <span className={styles.accumValue}>{accumulatedResult} {unitLabel} ({segmentCount} {segmentCount === 1 ? 'seg' : 'segs'})</span>
          </div>
        )}

        {/* Real-time ceiling SF preview */}
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
            ? 'Click each item on the blueprint to count it.'
            : activeType === 'LF'
            ? 'Click to trace the line. Double-click or Finish to close.'
            : 'Click to draw polygon corners. Double-click or Finish to close.'}
        </p>
        <div className={styles.actions}>
          <button
            className={styles.finishBtn}
            onClick={onFinish}
            disabled={pointCount < (activeType === 'count' ? 1 : 2)}
          >
            {isAccumulating ? 'Finish Segment' : 'Finish Zone'}
          </button>
          {isAccumulating && (
            <button className={styles.finalizeBtn} onClick={onFinalizeZone}>
              Done — Save Zone
            </button>
          )}
          <button className={styles.undoBtn} onClick={onUndoPoint} disabled={pointCount === 0}>
            Undo Last Point
          </button>
          <button className={styles.cancelBtn} onClick={onCancel}>
            {isAccumulating ? 'Cancel All' : 'Cancel'}
          </button>
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
              <label>Peak height</label>
              <input
                type="text"
                value={ceilingPeakHeight}
                onChange={e => setCeilingPeakHeight(e.target.value)}
                placeholder="e.g. 14' or 13'6&quot;"
              />
            </div>
            <div className={styles.heightField}>
              <label>Wall height</label>
              <input
                type="text"
                value={ceilingWallHeight}
                onChange={e => setCeilingWallHeight(e.target.value)}
                placeholder="e.g. 8' or 7'6&quot;"
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
              <label>Tray perimeter</label>
              <input
                type="text"
                value={ceilingTrayPerimeter}
                onChange={e => setCeilingTrayPerimeter(e.target.value)}
                placeholder="e.g. 24' or 22'6&quot;"
              />
            </div>
            <div className={styles.heightField}>
              <label>Drop depth</label>
              <input
                type="text"
                value={ceilingDropDepth}
                onChange={e => setCeilingDropDepth(e.target.value)}
                placeholder="e.g. 0'6&quot; or 6&quot;"
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
              <label>Low wall</label>
              <input
                type="text"
                value={ceilingLowWallHeight}
                onChange={e => setCeilingLowWallHeight(e.target.value)}
                placeholder="e.g. 8' or 7'6&quot;"
              />
            </div>
            <div className={styles.heightField}>
              <label>High wall</label>
              <input
                type="text"
                value={ceilingHighWallHeight}
                onChange={e => setCeilingHighWallHeight(e.target.value)}
                placeholder="e.g. 12' or 11'6&quot;"
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

      <div className={styles.field}>
        <label>Zone Color <span className={styles.optional}>(optional)</span></label>
        <div className={styles.colorSwatches}>
          <button
            type="button"
            className={`${styles.colorSwatch} ${styles.colorAuto} ${color === null ? styles.colorSwatchActive : ''}`}
            onClick={() => setColor(null)}
            title="Auto (cycles through default palette)"
          >
            A
          </button>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`${styles.colorSwatch} ${color === c ? styles.colorSwatchActive : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>
      </div>

      <button type="submit" className={styles.startBtn}>Start Drawing</button>
    </form>
  )
}
