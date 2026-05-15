import { useState } from 'react'
import InfoTooltip from '../ui/InfoTooltip'
import Chip from '../ui/Chip'
import styles from './ZoneList.module.css'
import { getMaxReach, estimatePaint } from '../../utils/measurements'
import { parseFeetInches, formatFeetInches, formatSF, formatLF } from '../../utils/fractions'
import { evaluateZoneTest, computeExpectedTotal } from '../../utils/testEvaluation'

const PRESET_COLORS = [
  '#2e8bff', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
  '#8b5cf6', '#f43f5e', '#64748b', '#0ea5e9',
]

// Simple inline SVG eye / eye-off icons for the visibility toggle
function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function measurementVariant(type) {
  switch (type) {
    case 'SF': return 'info'
    case 'LF': return 'success'
    case 'count': return 'warning'
    default: return 'neutral'
  }
}

const SURFACE_TYPES = ['Wall', 'Ceiling', 'Trim', 'Door', 'Window', 'Cabinet', 'Floor', 'Exterior', 'Other']

const PITCH_OPTIONS = [1,2,3,4,5,6,7,8,9,10,12,14,16,18].map(rise => ({
  value: rise,
  label: `${rise}/12 (${(Math.atan(rise / 12) * (180 / Math.PI)).toFixed(1)}°)`,
}))

const PITCH_PRESETS = [4, 6, 8, 10, 12]

const CEILING_TYPE_LABELS = {
  flat: 'Flat',
  vaulted: 'Vaulted',
  tray: 'Tray',
  shed: 'Shed',
}

export default function ZoneList({ zones, onDelete, onUpdate, onRedraw, redrawingZoneId, enabledFeatures = {}, hiddenZoneIds, onToggleVisibility,
  isTestMode, testData = {}, onTestDataChange, onLogTest, pixelsPerFoot }) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSurfaceType, setEditSurfaceType] = useState('')
  const [editCoatCount, setEditCoatCount] = useState(1)
  const [editSurfaceFinish, setEditSurfaceFinish] = useState('smooth')
  const [editNotes, setEditNotes] = useState('')

  // Ceiling edit fields
  const [editCeilingType, setEditCeilingType] = useState('flat')
  const [editCeilingPeakHeight, setEditCeilingPeakHeight] = useState('')
  const [editCeilingWallHeight, setEditCeilingWallHeight] = useState('')
  const [editCeilingTrayPerimeter, setEditCeilingTrayPerimeter] = useState('')
  const [editCeilingDropDepth, setEditCeilingDropDepth] = useState('')
  const [editCeilingLowWallHeight, setEditCeilingLowWallHeight] = useState('')
  const [editCeilingHighWallHeight, setEditCeilingHighWallHeight] = useState('')
  const [editColor, setEditColor] = useState(null)
  const [editPitchMode, setEditPitchMode] = useState(false)
  const [editPitchRise, setEditPitchRise] = useState(6)

  // Wall edit fields
  const [editWallHeight, setEditWallHeight] = useState('')
  const [editOpenings, setEditOpenings] = useState([])

  const [saving, setSaving] = useState(false)
  const [testingZoneId, setTestingZoneId] = useState(null)
  const [loggingTestId, setLoggingTestId] = useState(null)

  // Collapse state — all zones start collapsed. Editing forces expand.
  const [expandedZoneIds, setExpandedZoneIds] = useState(new Set())
  function toggleExpand(zoneId) {
    setExpandedZoneIds(prev => {
      const next = new Set(prev)
      if (next.has(zoneId)) next.delete(zoneId)
      else next.add(zoneId)
      return next
    })
  }

  function startEdit(zone) {
    setEditingId(zone.id)
    setEditName(zone.name)
    setEditDescription(zone.description ?? '')
    setEditSurfaceType(zone.surface_type ?? '')
    setEditCoatCount(zone.coat_count ?? 1)
    setEditSurfaceFinish(zone.surface_finish ?? 'smooth')
    setEditNotes(zone.notes ?? '')
    setEditCeilingType(zone.ceiling_type ?? 'flat')
    setEditCeilingPeakHeight(zone.ceiling_peak_height    ? formatFeetInches(zone.ceiling_peak_height)    : '')
    setEditCeilingWallHeight(zone.ceiling_wall_height    ? formatFeetInches(zone.ceiling_wall_height)    : '')
    setEditCeilingTrayPerimeter(zone.ceiling_tray_perimeter ? formatFeetInches(zone.ceiling_tray_perimeter) : '')
    setEditCeilingDropDepth(zone.ceiling_drop_depth      ? formatFeetInches(zone.ceiling_drop_depth)      : '')
    setEditCeilingLowWallHeight(zone.ceiling_low_wall_height  ? formatFeetInches(zone.ceiling_low_wall_height)  : '')
    setEditCeilingHighWallHeight(zone.ceiling_high_wall_height ? formatFeetInches(zone.ceiling_high_wall_height) : '')
    setEditColor(zone.color ?? null)
    setEditPitchMode(!!zone.ceiling_pitch_rise)
    setEditPitchRise(zone.ceiling_pitch_rise ?? 6)
    setEditWallHeight(zone.wall_height ? formatFeetInches(zone.wall_height) : '')
    setEditOpenings((zone.opening_deductions ?? []).map((o, i) => ({ id: i + 1, ...o })))
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleSave(zoneId) {
    if (!editName.trim()) return
    setSaving(true)
    const isCeiling = editSurfaceType === 'Ceiling'
    try {
      await onUpdate(zoneId, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        surface_type: editSurfaceType || null,
        coat_count: editCoatCount,
        surface_finish: editSurfaceFinish,
        notes: editNotes.trim() || null,
        ceiling_type: isCeiling ? editCeilingType : null,
        ceiling_pitch_rise: isCeiling && editPitchMode && (editCeilingType === 'vaulted' || editCeilingType === 'shed') ? editPitchRise : null,
        ceiling_peak_height:      isCeiling && !editPitchMode && editCeilingType === 'vaulted' ? parseFeetInches(editCeilingPeakHeight)    : null,
        ceiling_wall_height:      isCeiling && !editPitchMode && editCeilingType === 'vaulted' ? parseFeetInches(editCeilingWallHeight)    : null,
        ceiling_tray_perimeter:   isCeiling && editCeilingType === 'tray'    ? parseFeetInches(editCeilingTrayPerimeter) : null,
        ceiling_drop_depth:       isCeiling && editCeilingType === 'tray'    ? parseFeetInches(editCeilingDropDepth)     : null,
        ceiling_low_wall_height:  isCeiling && !editPitchMode && editCeilingType === 'shed'    ? parseFeetInches(editCeilingLowWallHeight)  : null,
        ceiling_high_wall_height: isCeiling && !editPitchMode && editCeilingType === 'shed'    ? parseFeetInches(editCeilingHighWallHeight) : null,
        color: editColor ?? null,
        wall_height: editSurfaceType === 'Wall' ? parseFeetInches(editWallHeight) : null,
        opening_deductions: editSurfaceType === 'Wall' && editOpenings.length > 0
          ? editOpenings.map(o => ({ name: o.name, sf: o.sf }))
          : null,
      })
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  if (zones.length === 0) {
    return (
      <div className={styles.empty}>
        No zones in the yard yet. Pick a tool and start drawing on the canvas.
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {zones.map(zone => {
        const isRedrawing = zone.id === redrawingZoneId

        const isExpanded = expandedZoneIds.has(zone.id) || editingId === zone.id

        return (
          <div key={zone.id} className={`${styles.zone} ${isRedrawing ? styles.zoneRedrawing : ''} ${hiddenZoneIds?.has(zone.id) ? styles.zoneHidden : ''}`}>
            {editingId === zone.id ? (
              <div className={styles.editForm}>
                <input
                  className={styles.editInput}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Zone name"
                />
                <input
                  className={styles.editInput}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="Description (optional)"
                />
                <select
                  className={styles.editSelect}
                  value={editSurfaceType}
                  onChange={e => setEditSurfaceType(e.target.value)}
                >
                  <option value="">Surface type (optional)</option>
                  {SURFACE_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>

                {/* Ceiling type selector — shown when surface type is Ceiling */}
                {editSurfaceType === 'Ceiling' && (
                  <select
                    className={styles.editSelect}
                    value={editCeilingType}
                    onChange={e => setEditCeilingType(e.target.value)}
                  >
                    <option value="flat">Flat (standard)</option>
                    <option value="vaulted">Vaulted / Cathedral</option>
                    <option value="tray">Tray / Coffered</option>
                    <option value="shed">Shed / Single slope</option>
                  </select>
                )}

                {/* Vaulted — heights OR pitch */}
                {editSurfaceType === 'Ceiling' && editCeilingType === 'vaulted' && (
                  <>
                    <div className={styles.editHeightRow}>
                      <button type="button" className={`${styles.editCoatBtn} ${!editPitchMode ? styles.editCoatActive : ''}`} onClick={() => setEditPitchMode(false)}>Use heights</button>
                      <button type="button" className={`${styles.editCoatBtn} ${editPitchMode ? styles.editCoatActive : ''}`} onClick={() => setEditPitchMode(true)}>Use pitch <InfoTooltip>Roof pitch describes the steepness as rise over run. A pitch of 8/12 means the roof rises 8 inches for every 12 inches of horizontal distance. Common residential pitches: 4/12 (low slope), 6/12 (medium), 8/12 (medium-steep), 10/12 (steep — most common for vaulted ceilings), 12/12 (very steep, 45°).</InfoTooltip></button>
                    </div>
                    {editPitchMode ? (
                      <>
                        <div className={styles.editPitchPresets}>
                          {PITCH_PRESETS.map(p => (
                            <button key={p} type="button"
                              className={`${styles.editPitchPresetBtn} ${editPitchRise === p ? styles.editPitchPresetActive : ''}`}
                              onClick={() => setEditPitchRise(p)}>
                              {p}/12{p === 10 ? <span className={styles.editPitchCommonTag}>Common</span> : null}
                            </button>
                          ))}
                        </div>
                        <select className={styles.editSelect} value={editPitchRise} onChange={e => setEditPitchRise(parseInt(e.target.value))}>
                          {PITCH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </>
                    ) : (
                      <div className={styles.editHeightRow}>
                        <div className={styles.editHeightField}>
                          <span className={styles.editHeightLabel}>Peak height</span>
                          <input className={styles.editInput} type="text" value={editCeilingPeakHeight} onChange={e => setEditCeilingPeakHeight(e.target.value)} placeholder="e.g. 14' or 13'6&quot;" />
                        </div>
                        <div className={styles.editHeightField}>
                          <span className={styles.editHeightLabel}>Wall height</span>
                          <input className={styles.editInput} type="text" value={editCeilingWallHeight} onChange={e => setEditCeilingWallHeight(e.target.value)} placeholder="e.g. 8' or 7'6&quot;" />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Tray inputs */}
                {editSurfaceType === 'Ceiling' && editCeilingType === 'tray' && (
                  <div className={styles.editHeightRow}>
                    <div className={styles.editHeightField}>
                      <span className={styles.editHeightLabel}>Tray perimeter</span>
                      <input
                        className={styles.editInput}
                        type="text"
                        value={editCeilingTrayPerimeter}
                        onChange={e => setEditCeilingTrayPerimeter(e.target.value)}
                        placeholder="e.g. 24' or 22'6&quot;"
                      />
                    </div>
                    <div className={styles.editHeightField}>
                      <span className={styles.editHeightLabel}>Drop depth</span>
                      <input
                        className={styles.editInput}
                        type="text"
                        value={editCeilingDropDepth}
                        onChange={e => setEditCeilingDropDepth(e.target.value)}
                        placeholder="e.g. 0'6&quot; or 6&quot;"
                      />
                    </div>
                  </div>
                )}

                {/* Shed — heights OR pitch */}
                {editSurfaceType === 'Ceiling' && editCeilingType === 'shed' && (
                  <>
                    <div className={styles.editHeightRow}>
                      <button type="button" className={`${styles.editCoatBtn} ${!editPitchMode ? styles.editCoatActive : ''}`} onClick={() => setEditPitchMode(false)}>Use heights</button>
                      <button type="button" className={`${styles.editCoatBtn} ${editPitchMode ? styles.editCoatActive : ''}`} onClick={() => setEditPitchMode(true)}>Use pitch <InfoTooltip>Roof pitch describes the steepness as rise over run. Common pitches: 4/12 (low), 6/12 (medium), 10/12 (steep, most common), 12/12 (45°).</InfoTooltip></button>
                    </div>
                    {editPitchMode ? (
                      <>
                        <div className={styles.editPitchPresets}>
                          {PITCH_PRESETS.map(p => (
                            <button key={p} type="button"
                              className={`${styles.editPitchPresetBtn} ${editPitchRise === p ? styles.editPitchPresetActive : ''}`}
                              onClick={() => setEditPitchRise(p)}>
                              {p}/12{p === 10 ? <span className={styles.editPitchCommonTag}>Common</span> : null}
                            </button>
                          ))}
                        </div>
                        <select className={styles.editSelect} value={editPitchRise} onChange={e => setEditPitchRise(parseInt(e.target.value))}>
                          {PITCH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </>
                    ) : (
                      <div className={styles.editHeightRow}>
                        <div className={styles.editHeightField}>
                          <span className={styles.editHeightLabel}>Low wall</span>
                          <input className={styles.editInput} type="text" value={editCeilingLowWallHeight} onChange={e => setEditCeilingLowWallHeight(e.target.value)} placeholder="e.g. 8' or 7'6&quot;" />
                        </div>
                        <div className={styles.editHeightField}>
                          <span className={styles.editHeightLabel}>High wall</span>
                          <input className={styles.editInput} type="text" value={editCeilingHighWallHeight} onChange={e => setEditCeilingHighWallHeight(e.target.value)} placeholder="e.g. 12' or 11'6&quot;" />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Wall height & openings — shown when editing a Wall/SF zone */}
                {editSurfaceType === 'Wall' && !enabledFeatures.wall_calculator && (
                  <div className={styles.zonePaintLocked}>
                    🔒 Wall calculator — available on Plus plan
                  </div>
                )}
                {editSurfaceType === 'Wall' && enabledFeatures.wall_calculator && (
                  <div className={styles.editFinishGroup}>
                    <span className={styles.editFinishLabel}>Wall Height &amp; Openings</span>
                    <input
                      className={styles.editInput}
                      type="text"
                      value={editWallHeight}
                      onChange={e => setEditWallHeight(e.target.value)}
                      placeholder="e.g. 9' or 8'6&quot;"
                    />
                    {editWallHeight && (
                      <>
                        {editOpenings.map(o => (
                          <div key={o.id} className={styles.editHeightRow}>
                            <input
                              className={styles.editInput}
                              value={o.name}
                              onChange={e => setEditOpenings(prev =>
                                prev.map(x => x.id === o.id ? { ...x, name: e.target.value } : x))}
                              placeholder="Name"
                              style={{ flex: 1 }}
                            />
                            <input
                              className={styles.editInput}
                              type="number" min="0" step="1"
                              value={o.sf}
                              onChange={e => setEditOpenings(prev =>
                                prev.map(x => x.id === o.id ? { ...x, sf: parseFloat(e.target.value) || 0 } : x))}
                              style={{ width: 60 }}
                            />
                            <button type="button" className={styles.editBtn}
                              onClick={() => setEditOpenings(prev => prev.filter(x => x.id !== o.id))}>✕</button>
                          </div>
                        ))}
                        <div className={styles.editFinishBtns}>
                          <button type="button" className={styles.editCoatBtn}
                            onClick={() => setEditOpenings(prev => [...prev, { id: Date.now(), name: 'Door', sf: 21 }])}>
                            + Door
                          </button>
                          <button type="button" className={styles.editCoatBtn}
                            onClick={() => setEditOpenings(prev => [...prev, { id: Date.now() + 1, name: 'Window', sf: 15 }])}>
                            + Window
                          </button>
                          <button type="button" className={styles.editCoatBtn}
                            onClick={() => setEditOpenings(prev => [...prev, { id: Date.now() + 2, name: 'Opening', sf: 0 }])}>
                            + Custom
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Coats UI removed — estimating concern, handled by EstimateBuilder.
                   editCoatCount state + save payload kept intact (default 1). */}

                {enabledFeatures.paint_calculator && (
                  <div className={styles.editFinishGroup}>
                    <span className={styles.editFinishLabel}>Surface finish <InfoTooltip>Coverage rate per gallon. Smooth surfaces (drywall, trim) cover ~350 SF/gal. Textured (popcorn, stucco) cover ~275 SF/gal.</InfoTooltip></span>
                    <div className={styles.editFinishBtns}>
                      {[
                        { value: 'smooth',   label: 'Smooth' },
                        { value: 'textured', label: 'Textured' },
                      ].map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          className={`${styles.editCoatBtn} ${editSurfaceFinish === value ? styles.editCoatActive : ''}`}
                          onClick={() => setEditSurfaceFinish(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <textarea
                  className={styles.editTextarea}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                />

                {/* Zone color picker */}
                <div className={styles.editColorGroup}>
                  <span className={styles.editColorLabel}>Zone Color</span>
                  <div className={styles.editColorSwatches}>
                    <button
                      type="button"
                      className={`${styles.editColorSwatch} ${styles.editColorAuto} ${editColor === null ? styles.editColorActive : ''}`}
                      onClick={() => setEditColor(null)}
                      title="Auto (default palette)"
                    >
                      A
                    </button>
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        className={`${styles.editColorSwatch} ${editColor === c ? styles.editColorActive : ''}`}
                        style={{ background: c }}
                        onClick={() => setEditColor(c)}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                <div className={styles.editActions}>
                  <button
                    className={styles.saveBtn}
                    onClick={() => handleSave(zone.id)}
                    disabled={saving || !editName.trim()}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button className={styles.cancelEditBtn} onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.zoneTop} onClick={() => toggleExpand(zone.id)} style={{ cursor: 'pointer' }}>
                  {/* Visibility toggle eye icon */}
                  <button
                    className={`${styles.visBtn} ${hiddenZoneIds?.has(zone.id) ? styles.visBtnHidden : ''}`}
                    onClick={e => { e.stopPropagation(); onToggleVisibility?.(zone.id) }}
                    title={hiddenZoneIds?.has(zone.id) ? 'Show on canvas' : 'Hide on canvas'}
                  >
                    {hiddenZoneIds?.has(zone.id) ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                  {/* Custom color dot (only shown when a custom color is set) */}
                  {zone.color && (
                    <span
                      className={styles.colorDot}
                      style={{ background: zone.color }}
                      title={`Zone color: ${zone.color}`}
                    />
                  )}
                  <span className={styles.zoneName}>{zone.name}</span>
                  <Chip variant={measurementVariant(zone.measurement_type)}>{zone.measurement_type}</Chip>
                  {/* Collapsed description preview + result + chevron */}
                  {!isExpanded && zone.description && (
                    <span className={styles.collapsedDesc}>
                      {zone.description.length > 40 ? zone.description.slice(0, 40) + '…' : zone.description}
                    </span>
                  )}
                  {!isExpanded && (
                    <span className={styles.collapsedResult}>
                      {zone.measurement_type === 'SF'
                        ? formatSF(zone.result ?? 0)
                        : zone.measurement_type === 'LF'
                        ? formatLF(zone.result ?? 0)
                        : `${Math.round(zone.result ?? 0)}`}
                    </span>
                  )}
                  <span className={styles.expandChevron}>{isExpanded ? '▾' : '▸'}</span>
                </div>
                {isExpanded && zone.description && (
                  <div className={styles.zoneDescription}>{zone.description}</div>
                )}
                {isExpanded && zone.surface_type && (
                  <div className={styles.zoneMeta}>
                    {zone.surface_type === 'Ceiling' && zone.ceiling_type && zone.ceiling_type !== 'flat'
                      ? `${zone.surface_type} · ${CEILING_TYPE_LABELS[zone.ceiling_type] ?? zone.ceiling_type}`
                      : zone.surface_type}
                  </div>
                )}
                {isExpanded && (<>
                <div className={styles.zoneResult}>
                  {zone.measurement_type === 'SF'
                    ? formatSF(zone.result ?? 0)
                    : zone.measurement_type === 'LF'
                    ? formatLF(zone.result ?? 0)
                    : `${Math.round(zone.result ?? 0)} items`}
                </div>
                {zone.ceiling_pitch_rise && zone.measurement_type === 'SF' && (
                  <div className={styles.zoneMeta}>
                    {zone.ceiling_pitch_rise}/12 pitch — result is sloped surface area
                  </div>
                )}

                {/* Soft warnings — visible to ALL users, always on */}
                {zone.measurement_type === 'SF' && (zone.result ?? 0) > 0 && (zone.result ?? 0) < 10 && (
                  <div className={styles.softWarning}>Warning: Result seems small — verify your scale is correct for this page.</div>
                )}
                {zone.measurement_type === 'LF' && (zone.result ?? 0) > 0 && (zone.result ?? 0) < 1 && (
                  <div className={styles.softWarning}>Warning: LF result seems very short — verify your scale.</div>
                )}
                {zone.measurement_type === 'SF' && (zone.points?.filter(p => p !== null && p !== undefined)?.length ?? 0) > 4 && (zone.result ?? 0) > 0 && (zone.result ?? 0) < 20 && (zone.result ?? 0) >= 10 && (
                  <div className={styles.softWarning}>Warning: Complex zone with low SF — verify scale calibration.</div>
                )}

                {/* Wall breakdown — shown when wall_height is set and feature enabled */}
                {zone.wall_height && zone.gross_wall_sf && enabledFeatures.wall_calculator && (
                  <div className={styles.zonePaintEstimate}>
                    <div>Wall: {formatFeetInches(zone.wall_height)} high · Gross {zone.gross_wall_sf} sf</div>
                    {zone.opening_deductions?.length > 0 && (
                      <div>Deductions: −{(zone.opening_deductions).reduce((s, o) => s + (o.sf ?? 0), 0)} sf ({zone.opening_deductions.length} openings)</div>
                    )}
                    <div>Net wall: {zone.net_wall_sf} sf</div>
                  </div>
                )}
                {(() => {
                  const reach = getMaxReach(zone)
                  return reach !== null ? (
                    <div className={styles.zoneMaxReach}>
                      Max reach: {formatFeetInches(reach)}
                    </div>
                  ) : null
                })()}
                {/* Paint estimate removed — estimating concern, handled by EstimateBuilder */}
                {zone.notes && (
                  <div className={styles.zoneNotes}>{zone.notes}</div>
                )}
                <div className={styles.zoneActions}>
                  <button
                    className={styles.editBtn}
                    onClick={() => startEdit(zone)}
                    disabled={isRedrawing}
                  >
                    Edit
                  </button>
                  <button
                    className={styles.redrawBtn}
                    onClick={() => onRedraw(zone)}
                    disabled={isRedrawing}
                  >
                    {isRedrawing ? 'Redrawing…' : 'Redraw'}
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => onDelete(zone.id)}
                    disabled={isRedrawing}
                  >
                    Remove
                  </button>
                  {isTestMode && (
                    <button
                      className={styles.testBtn}
                      onClick={() => setTestingZoneId(testingZoneId === zone.id ? null : zone.id)}
                    >
                      {testingZoneId === zone.id ? 'Close Test' : 'Test'}
                    </button>
                  )}
                </div>
                </>)}

                {/* ── Test panel ── */}
                {isExpanded && isTestMode && testingZoneId === zone.id && (() => {
                  const input = testData[zone.id] ?? { segments: [], countVerified: null, notes: '' }
                  const type = zone.measurement_type

                  // Ensure segments array exists with at least one entry
                  const defaultSeg = type === 'SF'
                    ? { label: '', mode: 'wd', width: '', depth: '', sf: '' }
                    : { label: '', lf: '' }
                  const segs = input.segments && input.segments.length > 0 ? input.segments : [defaultSeg]

                  const change = (field, val) => onTestDataChange?.(zone.id, { [field]: val })
                  const setSegs = (newSegs) => change('segments', newSegs)
                  const updateSeg = (idx, field, val) => {
                    const next = segs.map((s, i) => i === idx ? { ...s, [field]: val } : s)
                    setSegs(next)
                  }

                  // Build input with segments for evaluateZoneTest
                  const inputWithSegs = { ...input, segments: segs }
                  const ev = evaluateZoneTest(zone, inputWithSegs, pixelsPerFoot)
                  const expectedTotal = computeExpectedTotal(segs, type)

                  const sfLabels = ['main area', 'closet', 'bump-out', 'alcove', 'nook']
                  const lfLabels = ['north wall', 'east run', 'south wall', 'west run', 'hallway']

                  return (
                    <div className={styles.testPanel}>
                      {/* ── SF segments ── */}
                      {type === 'SF' && (
                        <>
                          {segs.map((seg, idx) => {
                            const segSf = seg.mode === 'direct'
                              ? (parseFloat(seg.sf) || 0)
                              : ((parseFeetInches(seg.width) || 0) * (parseFeetInches(seg.depth) || 0))
                            return (
                              <div key={idx} className={styles.testSegment}>
                                <div className={styles.testSegHeader}>
                                  <input className={styles.testSegLabel} value={seg.label}
                                    onChange={e => updateSeg(idx, 'label', e.target.value)}
                                    placeholder={sfLabels[idx % sfLabels.length]} />
                                  <div className={styles.testToggleRow}>
                                    <button type="button"
                                      className={`${styles.testModeBtn} ${seg.mode !== 'direct' ? styles.testModeBtnActive : ''}`}
                                      onClick={() => updateSeg(idx, 'mode', 'wd')}>W×D</button>
                                    <button type="button"
                                      className={`${styles.testModeBtn} ${seg.mode === 'direct' ? styles.testModeBtnActive : ''}`}
                                      onClick={() => updateSeg(idx, 'mode', 'direct')}>SF</button>
                                  </div>
                                  {segs.length > 1 && (
                                    <button type="button" className={styles.testSegRemove}
                                      onClick={() => setSegs(segs.filter((_, i) => i !== idx))}>✕</button>
                                  )}
                                </div>
                                {seg.mode === 'direct' ? (
                                  <div className={styles.testField}>
                                    <input value={seg.sf} onChange={e => updateSeg(idx, 'sf', e.target.value)}
                                      placeholder="e.g. 120" className={styles.testInput} />
                                  </div>
                                ) : (
                                  <div className={styles.testInputRow}>
                                    <div className={styles.testField}>
                                      <input value={seg.width} onChange={e => updateSeg(idx, 'width', e.target.value)}
                                        placeholder="W e.g. 12'" className={styles.testInput} />
                                    </div>
                                    <div className={styles.testField}>
                                      <input value={seg.depth} onChange={e => updateSeg(idx, 'depth', e.target.value)}
                                        placeholder="D e.g. 10'" className={styles.testInput} />
                                    </div>
                                  </div>
                                )}
                                {segSf > 0 && <div className={styles.testSegSf}>{segSf.toFixed(1)} sf</div>}
                              </div>
                            )
                          })}
                          {segs.length < 10 && (
                            <button type="button" className={styles.testAddSeg}
                              onClick={() => setSegs([...segs, { label: '', mode: 'wd', width: '', depth: '', sf: '' }])}>
                              + Add Segment
                            </button>
                          )}
                          {expectedTotal != null && (
                            <div className={styles.testCalc}><strong>Expected Total: {expectedTotal.toFixed(2)} SF</strong></div>
                          )}
                        </>
                      )}

                      {/* ── LF segments ── */}
                      {type === 'LF' && (
                        <>
                          {segs.map((seg, idx) => (
                            <div key={idx} className={styles.testSegment}>
                              <div className={styles.testSegHeader}>
                                <input className={styles.testSegLabel} value={seg.label}
                                  onChange={e => updateSeg(idx, 'label', e.target.value)}
                                  placeholder={lfLabels[idx % lfLabels.length]} />
                                {segs.length > 1 && (
                                  <button type="button" className={styles.testSegRemove}
                                    onClick={() => setSegs(segs.filter((_, i) => i !== idx))}>✕</button>
                                )}
                              </div>
                              <div className={styles.testField}>
                                <input value={seg.lf} onChange={e => updateSeg(idx, 'lf', e.target.value)}
                                  placeholder="e.g. 12'6&quot;" className={styles.testInput} />
                              </div>
                              {parseFeetInches(seg.lf) > 0 && (
                                <div className={styles.testSegSf}>{parseFeetInches(seg.lf).toFixed(2)} lf</div>
                              )}
                            </div>
                          ))}
                          {segs.length < 10 && (
                            <button type="button" className={styles.testAddSeg}
                              onClick={() => setSegs([...segs, { label: '', lf: '' }])}>
                              + Add Segment
                            </button>
                          )}
                          {expectedTotal != null && (
                            <div className={styles.testCalc}><strong>Expected Total: {expectedTotal.toFixed(2)} LF</strong></div>
                          )}
                        </>
                      )}

                      {/* ── Count (unchanged) ── */}
                      {type === 'count' && (
                        <div className={styles.testCountSection}>
                          <div className={styles.testCalc}>Count verification is manual</div>
                          <div className={styles.testInputRow}>
                            <button type="button"
                              className={`${styles.testModeBtn} ${input.countVerified === true ? styles.testPassBtn : ''}`}
                              onClick={() => change('countVerified', true)}>
                              Mark Verified
                            </button>
                            <button type="button"
                              className={`${styles.testModeBtn} ${input.countVerified === false ? styles.testFailBtn : ''}`}
                              onClick={() => change('countVerified', false)}>
                              Mark Not Verified
                            </button>
                          </div>
                        </div>
                      )}

                      <div className={styles.testCalc}>
                        Measured: <strong>{zone.result ?? 0} {type}</strong>
                      </div>

                      {ev.variance != null && (
                        <div className={styles.testCalc}>
                          Variance: {ev.variance > 0 ? '+' : ''}{ev.variance.toFixed(2)} ({ev.variancePct > 0 ? '+' : ''}{ev.variancePct}%)
                        </div>
                      )}

                      {ev.verdict && (
                        <div className={`${styles.testVerdict} ${ev.verdict === 'PASS' ? styles.testVerdictPass : styles.testVerdictFail}`}>
                          {ev.verdict}
                        </div>
                      )}
                      {ev.errorCode && (
                        <div className={styles.testError}>
                          <strong>{ev.errorCode}</strong>: {ev.errorMessage}
                        </div>
                      )}

                      <div className={styles.testField}>
                        <label>Notes</label>
                        <input value={input.notes} onChange={e => change('notes', e.target.value)}
                          placeholder="Test notes" className={styles.testInput} />
                      </div>

                      <button
                        className={styles.testLogBtn}
                        disabled={!ev.verdict || loggingTestId === zone.id}
                        onClick={async () => {
                          setLoggingTestId(zone.id)
                          await onLogTest?.(zone)
                          setLoggingTestId(null)
                        }}
                      >
                        {loggingTestId === zone.id ? 'Logging…' : 'Log Test Result'}
                      </button>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
