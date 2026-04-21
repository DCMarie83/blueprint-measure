import { useState } from 'react'
import styles from './ZoneList.module.css'
import { getMaxReach, estimatePaint } from '../../utils/measurements'

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

const TYPE_COLORS = {
  SF: '#2e8bff',
  LF: '#22c55e',
  count: '#f59e0b',
}

const SURFACE_TYPES = ['Wall', 'Ceiling', 'Trim', 'Door', 'Window', 'Cabinet', 'Floor', 'Exterior', 'Other']

const CEILING_TYPE_LABELS = {
  flat: 'Flat',
  vaulted: 'Vaulted',
  tray: 'Tray',
  shed: 'Shed',
}

export default function ZoneList({ zones, onDelete, onUpdate, onRedraw, redrawingZoneId, enabledFeatures = {}, hiddenZoneIds, onToggleVisibility }) {
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

  const [saving, setSaving] = useState(false)

  function startEdit(zone) {
    setEditingId(zone.id)
    setEditName(zone.name)
    setEditDescription(zone.description ?? '')
    setEditSurfaceType(zone.surface_type ?? '')
    setEditCoatCount(zone.coat_count ?? 1)
    setEditSurfaceFinish(zone.surface_finish ?? 'smooth')
    setEditNotes(zone.notes ?? '')
    setEditCeilingType(zone.ceiling_type ?? 'flat')
    setEditCeilingPeakHeight(zone.ceiling_peak_height ?? '')
    setEditCeilingWallHeight(zone.ceiling_wall_height ?? '')
    setEditCeilingTrayPerimeter(zone.ceiling_tray_perimeter ?? '')
    setEditCeilingDropDepth(zone.ceiling_drop_depth ?? '')
    setEditCeilingLowWallHeight(zone.ceiling_low_wall_height ?? '')
    setEditCeilingHighWallHeight(zone.ceiling_high_wall_height ?? '')
    setEditColor(zone.color ?? null)
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
        ceiling_peak_height:    isCeiling && editCeilingType === 'vaulted' ? parseFloat(editCeilingPeakHeight)    || null : null,
        ceiling_wall_height:    isCeiling && editCeilingType === 'vaulted' ? parseFloat(editCeilingWallHeight)    || null : null,
        ceiling_tray_perimeter: isCeiling && editCeilingType === 'tray'    ? parseFloat(editCeilingTrayPerimeter) || null : null,
        ceiling_drop_depth:     isCeiling && editCeilingType === 'tray'    ? parseFloat(editCeilingDropDepth)     || null : null,
        ceiling_low_wall_height:  isCeiling && editCeilingType === 'shed'  ? parseFloat(editCeilingLowWallHeight)  || null : null,
        ceiling_high_wall_height: isCeiling && editCeilingType === 'shed'  ? parseFloat(editCeilingHighWallHeight) || null : null,
        color: editColor ?? null,
      })
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  if (zones.length === 0) {
    return (
      <div className={styles.empty}>
        No zones yet. Select a measurement type and click the canvas to start drawing.
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {zones.map(zone => {
        const isRedrawing = zone.id === redrawingZoneId

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

                {/* Vaulted height inputs */}
                {editSurfaceType === 'Ceiling' && editCeilingType === 'vaulted' && (
                  <div className={styles.editHeightRow}>
                    <div className={styles.editHeightField}>
                      <span className={styles.editHeightLabel}>Peak height (ft)</span>
                      <input
                        className={styles.editInput}
                        type="number" min="0" step="0.5"
                        value={editCeilingPeakHeight}
                        onChange={e => setEditCeilingPeakHeight(e.target.value)}
                        placeholder="e.g. 14"
                      />
                    </div>
                    <div className={styles.editHeightField}>
                      <span className={styles.editHeightLabel}>Wall height (ft)</span>
                      <input
                        className={styles.editInput}
                        type="number" min="0" step="0.5"
                        value={editCeilingWallHeight}
                        onChange={e => setEditCeilingWallHeight(e.target.value)}
                        placeholder="e.g. 8"
                      />
                    </div>
                  </div>
                )}

                {/* Tray inputs */}
                {editSurfaceType === 'Ceiling' && editCeilingType === 'tray' && (
                  <div className={styles.editHeightRow}>
                    <div className={styles.editHeightField}>
                      <span className={styles.editHeightLabel}>Tray perimeter (ft)</span>
                      <input
                        className={styles.editInput}
                        type="number" min="0" step="0.5"
                        value={editCeilingTrayPerimeter}
                        onChange={e => setEditCeilingTrayPerimeter(e.target.value)}
                        placeholder="e.g. 24"
                      />
                    </div>
                    <div className={styles.editHeightField}>
                      <span className={styles.editHeightLabel}>Drop depth (in)</span>
                      <input
                        className={styles.editInput}
                        type="number" min="0" step="0.25"
                        value={editCeilingDropDepth}
                        onChange={e => setEditCeilingDropDepth(e.target.value)}
                        placeholder="e.g. 6"
                      />
                    </div>
                  </div>
                )}

                {/* Shed height inputs */}
                {editSurfaceType === 'Ceiling' && editCeilingType === 'shed' && (
                  <div className={styles.editHeightRow}>
                    <div className={styles.editHeightField}>
                      <span className={styles.editHeightLabel}>Low wall (ft)</span>
                      <input
                        className={styles.editInput}
                        type="number" min="0" step="0.5"
                        value={editCeilingLowWallHeight}
                        onChange={e => setEditCeilingLowWallHeight(e.target.value)}
                        placeholder="e.g. 8"
                      />
                    </div>
                    <div className={styles.editHeightField}>
                      <span className={styles.editHeightLabel}>High wall (ft)</span>
                      <input
                        className={styles.editInput}
                        type="number" min="0" step="0.5"
                        value={editCeilingHighWallHeight}
                        onChange={e => setEditCeilingHighWallHeight(e.target.value)}
                        placeholder="e.g. 12"
                      />
                    </div>
                  </div>
                )}

                <div className={styles.editCoatGroup}>
                  {[1, 2].map(n => (
                    <button
                      key={n}
                      type="button"
                      className={`${styles.editCoatBtn} ${editCoatCount === n ? styles.editCoatActive : ''}`}
                      onClick={() => setEditCoatCount(n)}
                    >
                      {n} {n === 1 ? 'coat' : 'coats'}
                    </button>
                  ))}
                </div>

                {enabledFeatures.paint_calculator && (
                  <div className={styles.editFinishGroup}>
                    <span className={styles.editFinishLabel}>Surface finish</span>
                    <div className={styles.editFinishBtns}>
                      {[
                        { value: 'smooth',   label: 'Smooth (350 SF/gal)' },
                        { value: 'textured', label: 'Textured (275 SF/gal)' },
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
                <div className={styles.zoneTop}>
                  {/* Visibility toggle eye icon */}
                  <button
                    className={`${styles.visBtn} ${hiddenZoneIds?.has(zone.id) ? styles.visBtnHidden : ''}`}
                    onClick={() => onToggleVisibility?.(zone.id)}
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
                  <span
                    className={styles.zoneType}
                    style={{ background: TYPE_COLORS[zone.measurement_type] + '22', color: TYPE_COLORS[zone.measurement_type] }}
                  >
                    {zone.measurement_type}
                  </span>
                </div>
                {zone.description && (
                  <div className={styles.zoneDescription}>{zone.description}</div>
                )}
                {(zone.surface_type || (zone.coat_count && zone.coat_count > 1)) && (
                  <div className={styles.zoneMeta}>
                    {[
                      // Show "Ceiling · Vaulted" style label when ceiling type is not flat
                      zone.surface_type === 'Ceiling' && zone.ceiling_type && zone.ceiling_type !== 'flat'
                        ? `${zone.surface_type} · ${CEILING_TYPE_LABELS[zone.ceiling_type] ?? zone.ceiling_type}`
                        : zone.surface_type,
                      zone.coat_count > 1 ? `${zone.coat_count} coats` : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div className={styles.zoneResult}>
                  {zone.result ?? 0}{' '}
                  <span className={styles.zoneUnit}>
                    {zone.measurement_type === 'SF' ? 'sq ft'
                      : zone.measurement_type === 'LF' ? 'lin ft'
                      : 'each'}
                  </span>
                </div>
                {(() => {
                  const reach = getMaxReach(zone)
                  return reach !== null ? (
                    <div className={styles.zoneMaxReach}>
                      Max reach: {reach} ft
                    </div>
                  ) : null
                })()}
                {zone.measurement_type === 'SF' && (
                  enabledFeatures.paint_calculator ? (
                    (() => {
                      const gal = estimatePaint(zone)
                      return gal !== null ? (
                        <div className={styles.zonePaintEstimate}>
                          Est. paint: {gal} gal
                        </div>
                      ) : null
                    })()
                  ) : (
                    <div className={styles.zonePaintLocked}>
                      🔒 Paint calculator — available on paid plans
                    </div>
                  )
                )}
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
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
