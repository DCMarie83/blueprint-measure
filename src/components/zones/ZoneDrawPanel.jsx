import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseFeetInches } from '../../utils/fractions'
import InfoTooltip from '../ui/InfoTooltip'
import styles from './ZoneDrawPanel.module.css'

const SURFACE_TYPES = ['Wall', 'Ceiling', 'Trim', 'Door', 'Window', 'Cabinet', 'Floor', 'Exterior', 'Other']

const PITCH_OPTIONS = [1,2,3,4,5,6,7,8,9,10,12,14,16,18].map(rise => ({
  value: rise,
  label: `${rise}/12 (${(Math.atan(rise / 12) * (180 / Math.PI)).toFixed(1)}°)`,
}))

const PITCH_PRESETS = [4, 6, 8, 10, 12]

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
let openingIdCounter = 0

export default function ZoneDrawPanel({
  onStart, onCancel, onUndoPoint, onAddSegment, onFinalizeZone,
  isDrawing, isAccumulating, segmentCount = 0, accumulatedResult = 0,
  pointCount, onFinish, drawingType, sfPreview, wallPreview,
  enabledFeatures = {},
  selectedType, onTypeChange,
  selectedColor, onColorChange,
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [surfaceType, setSurfaceType] = useState('')
  const [typeLocal, setTypeLocal] = useState(selectedType ?? 'SF')
  const type = selectedType ?? typeLocal
  function setType(t) { setTypeLocal(t); onTypeChange?.(t) }
  const [colorLocal, setColorLocal] = useState(selectedColor ?? null)
  const color = selectedColor ?? colorLocal
  function setColor(c) { setColorLocal(c); onColorChange?.(c) }

  // Ceiling-specific fields — only used when surfaceType === 'Ceiling'
  const [ceilingType, setCeilingType] = useState('flat')
  const [ceilingPeakHeight, setCeilingPeakHeight] = useState('')
  const [ceilingWallHeight, setCeilingWallHeight] = useState('')
  const [ceilingTrayPerimeter, setCeilingTrayPerimeter] = useState('')
  const [ceilingDropDepth, setCeilingDropDepth] = useState('')
  const [ceilingLowWallHeight, setCeilingLowWallHeight] = useState('')
  const [ceilingHighWallHeight, setCeilingHighWallHeight] = useState('')
  const [ceilingPitchMode, setCeilingPitchMode] = useState(false) // false = heights, true = pitch
  const [ceilingPitchRise, setCeilingPitchRise] = useState(6)

  // Wall-specific fields — only used when surfaceType === 'Wall' && type === 'SF'
  const [wallHeight, setWallHeight] = useState('')
  const [openings, setOpenings] = useState([]) // [{ id, name, sf }]

  function addOpening(name, sf) {
    setOpenings(prev => [...prev, { id: ++openingIdCounter, name, sf }])
  }
  function updateOpening(id, field, value) {
    setOpenings(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o))
  }
  function removeOpening(id) {
    setOpenings(prev => prev.filter(o => o.id !== id))
  }

  function handleStart(e) {
    e.preventDefault()
    if (!name.trim()) return
    const isCeiling = surfaceType === 'Ceiling'
    const isWall = surfaceType === 'Wall' && type === 'SF'
    onStart({
      name: name.trim(),
      description: description.trim() || null,
      surface_type: surfaceType || null,
      type,
      color: color ?? null,
      ceiling_type: isCeiling ? ceilingType : null,
      ceiling_pitch_rise: isCeiling && ceilingPitchMode && (ceilingType === 'vaulted' || ceilingType === 'shed') ? ceilingPitchRise : null,
      ceiling_peak_height:      isCeiling && !ceilingPitchMode && ceilingType === 'vaulted' ? parseFeetInches(ceilingPeakHeight)    : null,
      ceiling_wall_height:      isCeiling && !ceilingPitchMode && ceilingType === 'vaulted' ? parseFeetInches(ceilingWallHeight)    : null,
      ceiling_tray_perimeter:   isCeiling && ceilingType === 'tray'    ? parseFeetInches(ceilingTrayPerimeter) : null,
      ceiling_drop_depth:       isCeiling && ceilingType === 'tray'    ? parseFeetInches(ceilingDropDepth)     : null,
      ceiling_low_wall_height:  isCeiling && !ceilingPitchMode && ceilingType === 'shed'    ? parseFeetInches(ceilingLowWallHeight)  : null,
      ceiling_high_wall_height: isCeiling && !ceilingPitchMode && ceilingType === 'shed'    ? parseFeetInches(ceilingHighWallHeight) : null,
      wall_height: isWall ? parseFeetInches(wallHeight) : null,
      opening_deductions: isWall && openings.length > 0
        ? openings.map(o => ({ name: o.name, sf: o.sf }))
        : null,
    })
  }

  // During drawing, use the type passed from the parent if available
  // (covers redraw mode where the form was never shown).
  const activeType = drawingType ?? type
  const unitLabel = activeType === 'LF' ? t('blueprint:draw.unitLinFt') : activeType === 'count' ? t('blueprint:draw.unitItems') : activeType

  // ── Between-segment pause: segments finished, waiting for next action ─────────
  if (isAccumulating && !isDrawing) {
    return (
      <div className={styles.panel}>
        <div className={styles.status}>
          <div className={styles.dot} />
          {t('blueprint:draw.segmentsAdded', { count: segmentCount })}
        </div>
        <div className={styles.accumTotal}>
          <span className={styles.accumLabel}>{t('blueprint:draw.runningTotal')}</span>
          <span className={styles.accumValue}>{accumulatedResult} {unitLabel}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.finalizeBtn} onClick={onFinalizeZone}>
            {t('blueprint:draw.doneSaveZone')}
          </button>
          <button className={styles.addSegmentBtn} onClick={onAddSegment}>
            {t('blueprint:draw.addAnotherSegment')}
          </button>
          <button className={styles.cancelBtn} onClick={onCancel}>{t('blueprint:draw.cancelAll')}</button>
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
            ? t('blueprint:draw.segmentPointsPlaced', { seg: segmentCount + 1, count: pointCount })
            : activeType === 'count'
            ? t('blueprint:draw.itemsPlaced', { count: pointCount })
            : t('blueprint:draw.pointsPlaced', { count: pointCount })}
        </div>
        {activeType === 'count' && (
          <div className={styles.countDisplay}>
            <span className={styles.countNumber}>{pointCount}</span>
            <span className={styles.countLabel}>{t('blueprint:draw.itemsCounted')}</span>
          </div>
        )}

        {/* Running total shown while adding segments in accumulation mode */}
        {isAccumulating && segmentCount > 0 && (
          <div className={styles.accumTotal}>
            <span className={styles.accumLabel}>{t('blueprint:draw.addedSoFar')}</span>
            <span className={styles.accumValue}>{t('blueprint:draw.addedSoFarValue', { result: accumulatedResult, unit: unitLabel, count: segmentCount })}</span>
          </div>
        )}

        {/* Real-time ceiling SF preview */}
        {sfPreview && (
          <div className={styles.sfPreview}>
            <div className={styles.sfPreviewRow}>
              <span className={styles.sfPreviewLabel}>{t('blueprint:draw.flatFootprint')}</span>
              <span className={styles.sfPreviewValue}>{t('blueprint:draw.sqFtValue', { value: sfPreview.flat })}</span>
            </div>
            <div className={styles.sfPreviewRow}>
              <span className={styles.sfPreviewLabel}>{t('blueprint:draw.adjustedCeiling')}</span>
              <span className={styles.sfPreviewValueHighlight}>{t('blueprint:draw.sqFtValue', { value: sfPreview.adjusted })}</span>
            </div>
            {sfPreview.adjustment !== 0 && (
              <div className={styles.sfPreviewAdj}>
                {t('blueprint:draw.slopeAdjustment', { adj: (sfPreview.adjustment > 0 ? '+' : '') + sfPreview.adjustment })}
              </div>
            )}
          </div>
        )}

        {/* Real-time wall SF preview */}
        {wallPreview && (
          <div className={styles.sfPreview}>
            <div className={styles.sfPreviewRow}>
              <span className={styles.sfPreviewLabel}>{t('blueprint:draw.floorArea')}</span>
              <span className={styles.sfPreviewValue}>{t('blueprint:draw.sqFtValue', { value: wallPreview.floorSF })}</span>
            </div>
            <div className={styles.sfPreviewRow}>
              <span className={styles.sfPreviewLabel}>{t('blueprint:draw.perimeter')}</span>
              <span className={styles.sfPreviewValue}>{t('blueprint:draw.linFtValue', { value: wallPreview.perimeterLF })}</span>
            </div>
            <div className={styles.sfPreviewRow}>
              <span className={styles.sfPreviewLabel}>{t('blueprint:draw.wallSfGross')}</span>
              <span className={styles.sfPreviewValue}>{t('blueprint:draw.sqFtValue', { value: wallPreview.grossWallSF })}</span>
            </div>
            {wallPreview.totalDeductions > 0 && (
              <div className={styles.sfPreviewRow}>
                <span className={styles.sfPreviewLabel}>{t('blueprint:draw.deductions')}</span>
                <span className={styles.sfPreviewValue}>{t('blueprint:draw.deductionValue', { value: wallPreview.totalDeductions })}</span>
              </div>
            )}
            <div className={styles.sfPreviewRow}>
              <span className={styles.sfPreviewLabel}>{t('blueprint:draw.netWallSf')}</span>
              <span className={styles.sfPreviewValueHighlight}>{t('blueprint:draw.sqFtValue', { value: wallPreview.netWallSF })}</span>
            </div>
          </div>
        )}

        <p className={styles.hint}>
          {activeType === 'count'
            ? t('blueprint:draw.hintCount')
            : activeType === 'LF'
            ? t('blueprint:draw.hintLine')
            : t('blueprint:draw.hintPolygon')}
        </p>
        <div className={styles.actions}>
          <button
            className={styles.finishBtn}
            onClick={onFinish}
            disabled={pointCount < (activeType === 'count' ? 1 : 2)}
          >
            {isAccumulating ? t('blueprint:draw.finishSegment') : t('blueprint:draw.finishZone')}
          </button>
          {isAccumulating && (
            <button className={styles.finalizeBtn} onClick={onFinalizeZone}>
              {t('blueprint:draw.doneSaveZone')}
            </button>
          )}
          <button className={styles.undoBtn} onClick={onUndoPoint} disabled={pointCount === 0}>
            {t('blueprint:draw.undoLastPoint')}
          </button>
          <button className={styles.cancelBtn} onClick={onCancel}>
            {isAccumulating ? t('blueprint:draw.cancelAll') : t('common:action.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className={styles.panel} onSubmit={handleStart}>
      <div className={styles.field}>
        <label>{t('blueprint:draw.zoneName')}</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('blueprint:draw.zoneNamePlaceholder')}
          required
        />
      </div>

      <div className={styles.field}>
        <label>{t('blueprint:draw.description')} <span className={styles.optional}>{t('blueprint:draw.optional')}</span></label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t('blueprint:draw.descriptionPlaceholder')}
        />
      </div>

      <div className={styles.field}>
        <label>{t('blueprint:draw.surfaceType')} <span className={styles.optional}>{t('blueprint:draw.optional')}</span></label>
        <select
          className={styles.select}
          value={surfaceType}
          onChange={e => setSurfaceType(e.target.value)}
        >
          <option value="">{t('blueprint:draw.notSpecified')}</option>
          {SURFACE_TYPES.map(st => (
            <option key={st} value={st}>{t('common:surfaceType.' + st)}</option>
          ))}
        </select>
      </div>

      {/* Ceiling type selector — only shown when surface type is Ceiling */}
      {surfaceType === 'Ceiling' && (
        <div className={styles.field}>
          <label>{t('blueprint:draw.ceilingType')} <InfoTooltip>{t('blueprint:draw.ceilingTypeTip')}</InfoTooltip></label>
          <select
            className={styles.select}
            value={ceilingType}
            onChange={e => setCeilingType(e.target.value)}
          >
            <option value="flat">{t('blueprint:draw.ceilingFlat')}</option>
            <option value="vaulted">{t('blueprint:draw.ceilingVaulted')}</option>
            <option value="tray">{t('blueprint:draw.ceilingTray')}</option>
            <option value="shed">{t('blueprint:draw.ceilingShed')}</option>
          </select>
        </div>
      )}

      {/* Vaulted fields — heights OR pitch */}
      {surfaceType === 'Ceiling' && ceilingType === 'vaulted' && (
        <div className={styles.field}>
          <label>{t('blueprint:draw.vaultSlopeInput')} <InfoTooltip>{t('blueprint:draw.pitchTip')}</InfoTooltip></label>
          <div className={styles.heightRow} style={{ marginBottom: 8 }}>
            <button type="button" className={`${styles.typeBtn} ${!ceilingPitchMode ? styles.typeBtnActive : ''}`} onClick={() => setCeilingPitchMode(false)}>{t('blueprint:draw.useHeights')}</button>
            <button type="button" className={`${styles.typeBtn} ${ceilingPitchMode ? styles.typeBtnActive : ''}`} onClick={() => setCeilingPitchMode(true)}>{t('blueprint:draw.usePitchX12')}</button>
          </div>
          {ceilingPitchMode ? (
            <>
              <div className={styles.pitchPresets}>
                {PITCH_PRESETS.map(p => (
                  <button key={p} type="button"
                    className={`${styles.pitchPresetBtn} ${ceilingPitchRise === p ? styles.pitchPresetActive : ''}`}
                    onClick={() => setCeilingPitchRise(p)}>
                    {p}/12{p === 10 ? <span className={styles.pitchCommonTag}>{t('blueprint:draw.common')}</span> : null}
                  </button>
                ))}
              </div>
              <select className={styles.select} value={ceilingPitchRise} onChange={e => setCeilingPitchRise(parseInt(e.target.value))}>
                {PITCH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </>
          ) : (
            <div className={styles.heightRow}>
              <div className={styles.heightField}>
                <label>{t('blueprint:draw.peakHeight')}</label>
                <input type="text" value={ceilingPeakHeight} onChange={e => setCeilingPeakHeight(e.target.value)} placeholder="e.g. 14' or 13'6&quot;" />
              </div>
              <div className={styles.heightField}>
                <label>{t('blueprint:draw.wallHeight')}</label>
                <input type="text" value={ceilingWallHeight} onChange={e => setCeilingWallHeight(e.target.value)} placeholder="e.g. 8' or 7'6&quot;" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tray / Coffered fields — tray perimeter and drop depth */}
      {surfaceType === 'Ceiling' && ceilingType === 'tray' && (
        <div className={styles.field}>
          <label>{t('blueprint:draw.trayDetails')}</label>
          <div className={styles.heightRow}>
            <div className={styles.heightField}>
              <label>{t('blueprint:draw.trayPerimeter')}</label>
              <input
                type="text"
                value={ceilingTrayPerimeter}
                onChange={e => setCeilingTrayPerimeter(e.target.value)}
                placeholder="e.g. 24' or 22'6&quot;"
              />
            </div>
            <div className={styles.heightField}>
              <label>{t('blueprint:draw.dropDepth')}</label>
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

      {/* Shed / Single slope fields — heights OR pitch */}
      {surfaceType === 'Ceiling' && ceilingType === 'shed' && (
        <div className={styles.field}>
          <label>{t('blueprint:draw.shedSlopeInput')} <InfoTooltip>{t('blueprint:draw.pitchTip')}</InfoTooltip></label>
          <div className={styles.heightRow} style={{ marginBottom: 8 }}>
            <button type="button" className={`${styles.typeBtn} ${!ceilingPitchMode ? styles.typeBtnActive : ''}`} onClick={() => setCeilingPitchMode(false)}>{t('blueprint:draw.useHeights')}</button>
            <button type="button" className={`${styles.typeBtn} ${ceilingPitchMode ? styles.typeBtnActive : ''}`} onClick={() => setCeilingPitchMode(true)}>{t('blueprint:draw.usePitchX12')}</button>
          </div>
          {ceilingPitchMode ? (
            <>
              <div className={styles.pitchPresets}>
                {PITCH_PRESETS.map(p => (
                  <button key={p} type="button"
                    className={`${styles.pitchPresetBtn} ${ceilingPitchRise === p ? styles.pitchPresetActive : ''}`}
                    onClick={() => setCeilingPitchRise(p)}>
                    {p}/12{p === 10 ? <span className={styles.pitchCommonTag}>{t('blueprint:draw.common')}</span> : null}
                  </button>
                ))}
              </div>
              <select className={styles.select} value={ceilingPitchRise} onChange={e => setCeilingPitchRise(parseInt(e.target.value))}>
                {PITCH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </>
          ) : (
            <div className={styles.heightRow}>
              <div className={styles.heightField}>
                <label>{t('blueprint:draw.lowWall')}</label>
                <input type="text" value={ceilingLowWallHeight} onChange={e => setCeilingLowWallHeight(e.target.value)} placeholder="e.g. 8' or 7'6&quot;" />
              </div>
              <div className={styles.heightField}>
                <label>{t('blueprint:draw.highWall')}</label>
                <input type="text" value={ceilingHighWallHeight} onChange={e => setCeilingHighWallHeight(e.target.value)} placeholder="e.g. 12' or 11'6&quot;" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Wall height & openings — shown when Surface=Wall and Type=SF */}
      {surfaceType === 'Wall' && type === 'SF' && (
        enabledFeatures.wall_calculator ? (
          <div className={styles.field}>
            <label>{t('blueprint:draw.wallHeightOpenings')} <span className={styles.optional}>{t('blueprint:draw.optional')}</span></label>

            <div className={styles.heightField}>
              <label>{t('blueprint:draw.wallHeightFt')} <InfoTooltip>{t('blueprint:draw.wallHeightTip')}</InfoTooltip></label>
              <input
                type="text"
                value={wallHeight}
                onChange={e => setWallHeight(e.target.value)}
                placeholder="e.g. 9' or 8'6&quot;"
              />
            </div>

            {wallHeight && (
              <>
                <div className={styles.openingsHeader}>{t('blueprint:draw.openingDeductions')}</div>
                {openings.map(o => (
                  <div key={o.id} className={styles.openingRow}>
                    <input
                      className={styles.openingName}
                      value={o.name}
                      onChange={e => updateOpening(o.id, 'name', e.target.value)}
                      placeholder={t('blueprint:draw.namePlaceholder')}
                    />
                    <input
                      className={styles.openingSf}
                      type="number"
                      min="0"
                      step="1"
                      value={o.sf}
                      onChange={e => updateOpening(o.id, 'sf', parseFloat(e.target.value) || 0)}
                    />
                    <span className={styles.openingSfUnit}>{t('blueprint:draw.sfUnit')}</span>
                    <button type="button" className={styles.openingRemove}
                      onClick={() => removeOpening(o.id)}>✕</button>
                  </div>
                ))}
                <div className={styles.openingBtns}>
                  <button type="button" className={styles.openingAddBtn}
                    onClick={() => addOpening('Door', 21)}>{t('blueprint:draw.addDoor')} <InfoTooltip>{t('blueprint:draw.doorTip')}</InfoTooltip></button>
                  <button type="button" className={styles.openingAddBtn}
                    onClick={() => addOpening('Window', 15)}>{t('blueprint:draw.addWindow')} <InfoTooltip>{t('blueprint:draw.windowTip')}</InfoTooltip></button>
                  <button type="button" className={styles.openingAddBtn}
                    onClick={() => addOpening('Opening', 0)}>{t('blueprint:draw.addCustom')} <InfoTooltip>{t('blueprint:draw.customTip')}</InfoTooltip></button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={styles.lockedFeature}>
            {t('blueprint:draw.wallCalcLocked')}
          </div>
        )
      )}

      {/* Measurement type + color picker moved to Toolbar (Phase B).
         Controlled via selectedType/selectedColor props. */}

      <button type="submit" className={styles.startBtn}>{t('blueprint:draw.measureZone')}</button>
    </form>
  )
}
