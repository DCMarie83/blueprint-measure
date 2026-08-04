import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import InfoTooltip from '../ui/InfoTooltip'
import Chip from '../ui/Chip'
import styles from './ZoneList.module.css'
import { getMaxReach, applyDeductions } from '../../utils/measurements'
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

export default function ZoneList({ zones, onDelete, onUpdate, onRedraw, onStartDeductionMeasure, redrawingZoneId, enabledFeatures = {}, hiddenZoneIds, onToggleVisibility,
  isTestMode, testData = {}, onTestDataChange, onLogTest, pixelsPerFoot }) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSurfaceType, setEditSurfaceType] = useState('')
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

  // Deduction inline-add state
  const [addingDeductionZoneId, setAddingDeductionZoneId] = useState(null)
  const [deductName, setDeductName] = useState('')
  const [deductValue, setDeductValue] = useState('')
  const [deductError, setDeductError] = useState('')

  // Pending canvas-measured deduction meta
  const [pendingDeductionMeta, setPendingDeductionMeta] = useState(null)

  // Deduction working copy for edit form
  const [editDeductions, setEditDeductions] = useState([])

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
    setEditDeductions((zone.deductions ?? []).map(d => ({ ...d })))
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleSave(zoneId) {
    if (!editName.trim()) return
    const zone = zones.find(z => z.id === zoneId)
    const canDeductZone = zone && (zone.measurement_type === 'SF' || zone.measurement_type === 'LF') && editSurfaceType !== 'Wall'

    // Validate edit-form deductions
    if (canDeductZone && editDeductions.length > 0) {
      for (const d of editDeductions) {
        if (!d.name?.trim()) { alert(t('blueprint:zones.deductNeedsName')); return }
        if (!(Number(d.value) > 0)) { alert(t('blueprint:zones.deductValuePositive')); return }
      }
    }

    setSaving(true)
    const isCeiling = editSurfaceType === 'Ceiling'
    try {
      const payload = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        surface_type: editSurfaceType || null,
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
      }

      // Include deductions in the payload for non-wall SF/LF zones
      if (canDeductZone) {
        const cleanDeductions = editDeductions.map(d => {
          const base = { id: d.id, name: d.name.trim(), value: Number(d.value), source: d.source || 'manual' }
          if (base.source === 'canvas' && Array.isArray(d.points)) {
            base.points = d.points
            base.page_number = d.page_number
          }
          return base
        })
        const currentGross = zone.gross_result ?? zone.result
        if (cleanDeductions.length > 0) {
          payload.deductions = cleanDeductions
          payload.gross_result = currentGross
          payload.result = applyDeductions(currentGross, cleanDeductions)
        } else {
          payload.deductions = []
          payload.result = currentGross
          payload.gross_result = null
        }
      }

      await onUpdate(zoneId, payload)
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  if (zones.length === 0) {
    return (
      <div className={styles.empty}>
        {t('blueprint:zones.emptyList')}
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
                  placeholder={t('blueprint:zones.zoneNamePlaceholder')}
                />
                <input
                  className={styles.editInput}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder={t('blueprint:zones.descriptionPlaceholder')}
                />
                <select
                  className={styles.editSelect}
                  value={editSurfaceType}
                  onChange={e => setEditSurfaceType(e.target.value)}
                >
                  <option value="">{t('blueprint:zones.surfaceTypeOptional')}</option>
                  {SURFACE_TYPES.map(st => (
                    <option key={st} value={st}>{t('common:surfaceType.' + st)}</option>
                  ))}
                </select>

                {/* Ceiling type selector — shown when surface type is Ceiling */}
                {editSurfaceType === 'Ceiling' && (
                  <select
                    className={styles.editSelect}
                    value={editCeilingType}
                    onChange={e => setEditCeilingType(e.target.value)}
                  >
                    <option value="flat">{t('blueprint:draw.ceilingFlat')}</option>
                    <option value="vaulted">{t('blueprint:draw.ceilingVaulted')}</option>
                    <option value="tray">{t('blueprint:draw.ceilingTray')}</option>
                    <option value="shed">{t('blueprint:draw.ceilingShed')}</option>
                  </select>
                )}

                {/* Vaulted — heights OR pitch */}
                {editSurfaceType === 'Ceiling' && editCeilingType === 'vaulted' && (
                  <>
                    <div className={styles.editHeightRow}>
                      <button type="button" className={`${styles.editStepBtn} ${!editPitchMode ? styles.editStepActive : ''}`} onClick={() => setEditPitchMode(false)}>{t('blueprint:draw.useHeights')}</button>
                      <button type="button" className={`${styles.editStepBtn} ${editPitchMode ? styles.editStepActive : ''}`} onClick={() => setEditPitchMode(true)}>{t('blueprint:zones.usePitch')} <InfoTooltip>{t('blueprint:draw.pitchTip')}</InfoTooltip></button>
                    </div>
                    {editPitchMode ? (
                      <>
                        <div className={styles.editPitchPresets}>
                          {PITCH_PRESETS.map(p => (
                            <button key={p} type="button"
                              className={`${styles.editPitchPresetBtn} ${editPitchRise === p ? styles.editPitchPresetActive : ''}`}
                              onClick={() => setEditPitchRise(p)}>
                              {p}/12{p === 10 ? <span className={styles.editPitchCommonTag}>{t('blueprint:draw.common')}</span> : null}
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
                          <span className={styles.editHeightLabel}>{t('blueprint:draw.peakHeight')}</span>
                          <input className={styles.editInput} type="text" value={editCeilingPeakHeight} onChange={e => setEditCeilingPeakHeight(e.target.value)} placeholder="e.g. 14' or 13'6&quot;" />
                        </div>
                        <div className={styles.editHeightField}>
                          <span className={styles.editHeightLabel}>{t('blueprint:draw.wallHeight')}</span>
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
                      <span className={styles.editHeightLabel}>{t('blueprint:draw.trayPerimeter')}</span>
                      <input
                        className={styles.editInput}
                        type="text"
                        value={editCeilingTrayPerimeter}
                        onChange={e => setEditCeilingTrayPerimeter(e.target.value)}
                        placeholder="e.g. 24' or 22'6&quot;"
                      />
                    </div>
                    <div className={styles.editHeightField}>
                      <span className={styles.editHeightLabel}>{t('blueprint:draw.dropDepth')}</span>
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
                      <button type="button" className={`${styles.editStepBtn} ${!editPitchMode ? styles.editStepActive : ''}`} onClick={() => setEditPitchMode(false)}>{t('blueprint:draw.useHeights')}</button>
                      <button type="button" className={`${styles.editStepBtn} ${editPitchMode ? styles.editStepActive : ''}`} onClick={() => setEditPitchMode(true)}>{t('blueprint:zones.usePitch')} <InfoTooltip>{t('blueprint:zones.pitchTipShort')}</InfoTooltip></button>
                    </div>
                    {editPitchMode ? (
                      <>
                        <div className={styles.editPitchPresets}>
                          {PITCH_PRESETS.map(p => (
                            <button key={p} type="button"
                              className={`${styles.editPitchPresetBtn} ${editPitchRise === p ? styles.editPitchPresetActive : ''}`}
                              onClick={() => setEditPitchRise(p)}>
                              {p}/12{p === 10 ? <span className={styles.editPitchCommonTag}>{t('blueprint:draw.common')}</span> : null}
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
                          <span className={styles.editHeightLabel}>{t('blueprint:draw.lowWall')}</span>
                          <input className={styles.editInput} type="text" value={editCeilingLowWallHeight} onChange={e => setEditCeilingLowWallHeight(e.target.value)} placeholder="e.g. 8' or 7'6&quot;" />
                        </div>
                        <div className={styles.editHeightField}>
                          <span className={styles.editHeightLabel}>{t('blueprint:draw.highWall')}</span>
                          <input className={styles.editInput} type="text" value={editCeilingHighWallHeight} onChange={e => setEditCeilingHighWallHeight(e.target.value)} placeholder="e.g. 12' or 11'6&quot;" />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Wall height & openings — shown when editing a Wall/SF zone */}
                {editSurfaceType === 'Wall' && !enabledFeatures.wall_calculator && (
                  <div className={styles.zoneWallLocked}>
                    {t('blueprint:draw.wallCalcLocked')}
                  </div>
                )}
                {editSurfaceType === 'Wall' && enabledFeatures.wall_calculator && (
                  <div className={styles.editFinishGroup}>
                    <span className={styles.editFinishLabel}>{t('blueprint:draw.wallHeightOpenings')}</span>
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
                              placeholder={t('blueprint:draw.namePlaceholder')}
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
                          <button type="button" className={styles.editStepBtn}
                            onClick={() => setEditOpenings(prev => [...prev, { id: Date.now(), name: 'Door', sf: 21 }])}>
                            {t('blueprint:zones.addDoorShort')}
                          </button>
                          <button type="button" className={styles.editStepBtn}
                            onClick={() => setEditOpenings(prev => [...prev, { id: Date.now() + 1, name: 'Window', sf: 15 }])}>
                            {t('blueprint:zones.addWindowShort')}
                          </button>
                          <button type="button" className={styles.editStepBtn}
                            onClick={() => setEditOpenings(prev => [...prev, { id: Date.now() + 2, name: 'Opening', sf: 0 }])}>
                            {t('blueprint:draw.addCustom')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <textarea
                  className={styles.editTextarea}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder={t('blueprint:zones.notesPlaceholder')}
                  rows={2}
                />

                {/* Zone color picker */}
                <div className={styles.editColorGroup}>
                  <span className={styles.editColorLabel}>{t('blueprint:zones.zoneColor')}</span>
                  <div className={styles.editColorSwatches}>
                    <button
                      type="button"
                      className={`${styles.editColorSwatch} ${styles.editColorAuto} ${editColor === null ? styles.editColorActive : ''}`}
                      onClick={() => setEditColor(null)}
                      title={t('blueprint:zones.autoPalette')}
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

                {/* Deductions section — non-wall SF/LF zones only */}
                {(zone.measurement_type === 'SF' || zone.measurement_type === 'LF') && editSurfaceType !== 'Wall' && (
                  <div className={styles.editFinishGroup}>
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 8, display: 'block' }}>{t('blueprint:zones.deductions')}</span>
                    {editDeductions.map((d, idx) => {
                      const isCanvas = (d.source || 'manual') === 'canvas'
                      return (
                        <div key={d.id} style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, alignItems: 'center', marginBottom: 4, minWidth: 0, overflow: 'hidden' }}>
                          <input
                            className={styles.editInput}
                            value={d.name}
                            onChange={e => setEditDeductions(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                            placeholder={t('blueprint:draw.namePlaceholder')}
                            size={1}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          {isCanvas ? (
                            <span style={{ padding: '6px 2px', fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>{zone.measurement_type === 'LF' ? formatLF(Number(d.value || 0)) : formatSF(Number(d.value || 0))}</span>
                          ) : (
                            <>
                              <input
                                className={styles.editInput}
                                type="number" min="0.01" step="0.01"
                                value={d.value}
                                onChange={e => setEditDeductions(prev => prev.map((x, i) => i === idx ? { ...x, value: e.target.value } : x))}
                                size={1}
                                style={{ width: 48, minWidth: 0, flexShrink: 0 }}
                              />
                              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>{zone.measurement_type}</span>
                            </>
                          )}
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                            {isCanvas && onStartDeductionMeasure && (
                              <button type="button" className={styles.redrawBtn}
                                onClick={() => {
                                  const dedId = d.id
                                  onStartDeductionMeasure(zone, ({ value, points, page_number }) => {
                                    setEditDeductions(prev => prev.map(x => x.id === dedId ? { ...x, value, points, page_number, source: 'canvas' } : x))
                                  })
                                }}>{t('blueprint:zones.redo')}</button>
                            )}
                            <button type="button" className={styles.editBtn}
                              onClick={() => setEditDeductions(prev => prev.filter((_, i) => i !== idx))}>✕</button>
                          </div>
                        </div>
                      )
                    })}
                    <button type="button" className={styles.editStepBtn}
                      onClick={() => setEditDeductions(prev => [...prev, { id: crypto.randomUUID(), name: '', value: '', source: 'manual' }])}>
                      {t('blueprint:zones.addDeduction')}
                    </button>
                  </div>
                )}

                <div className={styles.editActions}>
                  <button
                    className={styles.saveBtn}
                    onClick={() => handleSave(zone.id)}
                    disabled={saving || !editName.trim()}
                  >
                    {saving ? t('blueprint:zones.saving') : t('common:action.save')}
                  </button>
                  <button className={styles.cancelEditBtn} onClick={cancelEdit}>{t('common:action.cancel')}</button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.zoneTop} onClick={() => toggleExpand(zone.id)} style={{ cursor: 'pointer' }}>
                  {/* Visibility toggle eye icon */}
                  <button
                    className={`${styles.visBtn} ${hiddenZoneIds?.has(zone.id) ? styles.visBtnHidden : ''}`}
                    onClick={e => { e.stopPropagation(); onToggleVisibility?.(zone.id) }}
                    title={hiddenZoneIds?.has(zone.id) ? t('blueprint:zones.showOnCanvas') : t('blueprint:zones.hideOnCanvas')}
                  >
                    {hiddenZoneIds?.has(zone.id) ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                  {/* Custom color dot (only shown when a custom color is set) */}
                  {zone.color && (
                    <span
                      className={styles.colorDot}
                      style={{ background: zone.color }}
                      title={t('blueprint:zones.zoneColorTitle', { color: zone.color })}
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
                      ? `${t('common:surfaceType.' + zone.surface_type)} · ${t('common:ceilingType.' + zone.ceiling_type)}`
                      : t('common:surfaceType.' + zone.surface_type)}
                  </div>
                )}
                {isExpanded && (<>
                {/* Deduction breakdown OR simple result */}
                {(zone.deductions?.length > 0 && zone.surface_type !== 'Wall') ? (() => {
                  const fmtDed = (v) => zone.measurement_type === 'LF' ? formatLF(Number(v) || 0) : formatSF(Number(v) || 0)
                  return (
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                      <div style={{ color: 'var(--color-text-muted)' }}>{t('blueprint:zones.gross')} {fmtDed(zone.gross_result)}</div>
                      {zone.deductions.map(d => (
                        <div key={d.id} style={{ paddingLeft: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>− {d.name}: {fmtDed(d.value)}</span>
                          <button
                            onClick={() => {
                              const newDeds = zone.deductions.filter(x => x.id !== d.id)
                              if (newDeds.length === 0) {
                                onUpdate(zone.id, { deductions: [], result: zone.gross_result, gross_result: null })
                              } else {
                                onUpdate(zone.id, { deductions: newDeds, result: applyDeductions(zone.gross_result, newDeds), gross_result: zone.gross_result })
                              }
                            }}
                            style={{ width: 16, height: 16, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 13, lineHeight: 1 }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger, #dc2626)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
                            title={t('blueprint:zones.removeDeduction')}
                          >×</button>
                        </div>
                      ))}
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{t('blueprint:zones.net')} {fmtDed(zone.result)}</div>
                    </div>
                  )
                })() : (
                  <div className={styles.zoneResult}>
                    {zone.measurement_type === 'SF'
                      ? formatSF(zone.result ?? 0)
                      : zone.measurement_type === 'LF'
                      ? formatLF(zone.result ?? 0)
                      : t('blueprint:zones.itemsResult', { count: Math.round(zone.result ?? 0) })}
                  </div>
                )}
                {zone.ceiling_pitch_rise && zone.measurement_type === 'SF' && (
                  <div className={styles.zoneMeta}>
                    {t('blueprint:zones.pitchSloped', { pitch: zone.ceiling_pitch_rise })}
                  </div>
                )}

                {/* Soft warnings — visible to ALL users, always on */}
                {zone.measurement_type === 'SF' && (zone.result ?? 0) > 0 && (zone.result ?? 0) < 10 && (
                  <div className={styles.softWarning}>{t('blueprint:zones.warnSmallSF')}</div>
                )}
                {zone.measurement_type === 'LF' && (zone.result ?? 0) > 0 && (zone.result ?? 0) < 1 && (
                  <div className={styles.softWarning}>{t('blueprint:zones.warnShortLF')}</div>
                )}
                {zone.measurement_type === 'SF' && (zone.points?.filter(p => p !== null && p !== undefined)?.length ?? 0) > 4 && (zone.result ?? 0) > 0 && (zone.result ?? 0) < 20 && (zone.result ?? 0) >= 10 && (
                  <div className={styles.softWarning}>{t('blueprint:zones.warnComplexLowSF')}</div>
                )}

                {/* Wall breakdown — shown when wall_height is set and feature enabled */}
                {zone.wall_height && zone.gross_wall_sf && enabledFeatures.wall_calculator && (
                  <div className={styles.zoneWallBreakdown}>
                    <div>{t('blueprint:zones.wallBreakdown', { height: formatFeetInches(zone.wall_height), gross: zone.gross_wall_sf })}</div>
                    {zone.opening_deductions?.length > 0 && (
                      <div>{t('blueprint:zones.wallDeductions', { sf: (zone.opening_deductions).reduce((s, o) => s + (o.sf ?? 0), 0), count: zone.opening_deductions.length })}</div>
                    )}
                    <div>{t('blueprint:zones.netWall', { sf: zone.net_wall_sf })}</div>
                  </div>
                )}
                {(() => {
                  const reach = getMaxReach(zone)
                  return reach !== null ? (
                    <div className={styles.zoneMaxReach}>
                      {t('blueprint:zones.maxReach', { reach: formatFeetInches(reach) })}
                    </div>
                  ) : null
                })()}
                {/* Paint estimate removed — estimating concern, handled by EstimateBuilder */}
                {zone.notes && (
                  <div className={styles.zoneNotes}>{zone.notes}</div>
                )}
                <div className={styles.zoneActions}>
                  {(zone.measurement_type === 'SF' || zone.measurement_type === 'LF') && zone.surface_type !== 'Wall' && (
                    <button
                      className={styles.deductBtn}
                      onClick={() => { setAddingDeductionZoneId(addingDeductionZoneId === zone.id ? null : zone.id); setDeductName(''); setDeductValue(''); setDeductError('') }}
                      disabled={isRedrawing}
                    >
                      {t('blueprint:zones.deduct')}
                    </button>
                  )}
                  <button
                    className={styles.editBtn}
                    onClick={() => startEdit(zone)}
                    disabled={isRedrawing}
                  >
                    {t('common:action.edit')}
                  </button>
                  <button
                    className={styles.redrawBtn}
                    onClick={() => onRedraw(zone)}
                    disabled={isRedrawing}
                  >
                    {isRedrawing ? t('blueprint:zones.redrawing') : t('blueprint:zones.redraw')}
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => onDelete(zone.id)}
                    disabled={isRedrawing}
                  >
                    {t('common:action.remove')}
                  </button>
                  {isTestMode && (
                    <button
                      className={styles.testBtn}
                      onClick={() => setTestingZoneId(testingZoneId === zone.id ? null : zone.id)}
                    >
                      {testingZoneId === zone.id ? t('blueprint:zones.closeTest') : t('blueprint:zones.testBtn')}
                    </button>
                  )}
                </div>

                {/* Inline add-deduction form */}
                {addingDeductionZoneId === zone.id && (
                  <div style={{ marginTop: 8, padding: 10, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <input
                        type="text"
                        placeholder={t('blueprint:zones.deductNamePlaceholder')}
                        maxLength={60}
                        value={deductName}
                        onChange={e => { setDeductName(e.target.value); setDeductError('') }}
                        style={{ flex: 1, minWidth: 140, padding: '6px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="0.00"
                          value={deductValue}
                          onChange={e => { setDeductValue(e.target.value); setPendingDeductionMeta(null); setDeductError('') }}
                          style={{ width: 80, padding: '6px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                          readOnly={!!pendingDeductionMeta}
                        />
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{zone.measurement_type}</span>
                      </div>
                      {onStartDeductionMeasure && (
                        <button
                          onClick={() => {
                            onStartDeductionMeasure(zone, ({ value, points, page_number }) => {
                              setDeductValue(value.toFixed(2))
                              setPendingDeductionMeta({ source: 'canvas', points, page_number })
                            })
                          }}
                          className={styles.deductBtn}
                          style={{ fontSize: 12, padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                        >
                          {t('blueprint:zones.measureOnBlueprint')}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const trimmed = deductName.trim()
                          if (!trimmed) { setDeductError(t('blueprint:zones.nameRequired')); return }
                          const val = parseFloat(deductValue)
                          if (!isFinite(val) || val <= 0) { setDeductError(t('blueprint:zones.valuePositive')); return }
                          const newDeduction = pendingDeductionMeta?.source === 'canvas'
                            ? { id: crypto.randomUUID(), name: trimmed, value: val, source: 'canvas', points: pendingDeductionMeta.points, page_number: pendingDeductionMeta.page_number }
                            : { id: crypto.randomUUID(), name: trimmed, value: val, source: 'manual' }
                          const currentGross = zone.gross_result ?? zone.result
                          const newDeductions = [...(zone.deductions || []), newDeduction]
                          onUpdate(zone.id, { deductions: newDeductions, gross_result: currentGross, result: applyDeductions(currentGross, newDeductions) })
                          setDeductName('')
                          setDeductValue('')
                          setDeductError('')
                          setPendingDeductionMeta(null)
                          setAddingDeductionZoneId(null)
                        }}
                        style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                      >
                        {t('common:action.save')}
                      </button>
                      <button
                        onClick={() => { setAddingDeductionZoneId(null); setDeductName(''); setDeductValue(''); setDeductError(''); setPendingDeductionMeta(null) }}
                        style={{ padding: '6px 10px', fontSize: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                      >
                        {t('common:action.cancel')}
                      </button>
                    </div>
                    {pendingDeductionMeta && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, fontStyle: 'italic' }}>{t('blueprint:zones.measuredFromBlueprint')}</div>}
                    {deductError && <div style={{ fontSize: 12, color: 'var(--color-danger, #dc2626)', marginTop: 4 }}>{deductError}</div>}
                  </div>
                )}
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

                  const sfLabels = [t('blueprint:zones.test.sfLabel1'), t('blueprint:zones.test.sfLabel2'), t('blueprint:zones.test.sfLabel3'), t('blueprint:zones.test.sfLabel4'), t('blueprint:zones.test.sfLabel5')]
                  const lfLabels = [t('blueprint:zones.test.lfLabel1'), t('blueprint:zones.test.lfLabel2'), t('blueprint:zones.test.lfLabel3'), t('blueprint:zones.test.lfLabel4'), t('blueprint:zones.test.lfLabel5')]

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
                              {t('blueprint:zones.test.addSegment')}
                            </button>
                          )}
                          {expectedTotal != null && (
                            <div className={styles.testCalc}><strong>{t('blueprint:zones.test.expectedTotalSF', { value: expectedTotal.toFixed(2) })}</strong></div>
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
                              {t('blueprint:zones.test.addSegment')}
                            </button>
                          )}
                          {expectedTotal != null && (
                            <div className={styles.testCalc}><strong>{t('blueprint:zones.test.expectedTotalLF', { value: expectedTotal.toFixed(2) })}</strong></div>
                          )}
                        </>
                      )}

                      {/* ── Count (unchanged) ── */}
                      {type === 'count' && (
                        <div className={styles.testCountSection}>
                          <div className={styles.testCalc}>{t('blueprint:zones.test.countManual')}</div>
                          <div className={styles.testInputRow}>
                            <button type="button"
                              className={`${styles.testModeBtn} ${input.countVerified === true ? styles.testPassBtn : ''}`}
                              onClick={() => change('countVerified', true)}>
                              {t('blueprint:zones.test.markVerified')}
                            </button>
                            <button type="button"
                              className={`${styles.testModeBtn} ${input.countVerified === false ? styles.testFailBtn : ''}`}
                              onClick={() => change('countVerified', false)}>
                              {t('blueprint:zones.test.markNotVerified')}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className={styles.testCalc}>
                        {t('blueprint:zones.test.measured')} <strong>{zone.result ?? 0} {type}</strong>
                      </div>

                      {ev.variance != null && (
                        <div className={styles.testCalc}>
                          {t('blueprint:zones.test.variance', { variance: (ev.variance > 0 ? '+' : '') + ev.variance.toFixed(2), pct: (ev.variancePct > 0 ? '+' : '') + ev.variancePct })}
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
                        <label>{t('blueprint:zones.test.notes')}</label>
                        <input value={input.notes} onChange={e => change('notes', e.target.value)}
                          placeholder={t('blueprint:zones.test.notesPlaceholder')} className={styles.testInput} />
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
                        {loggingTestId === zone.id ? t('blueprint:zones.test.logging') : t('blueprint:zones.test.logResult')}
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
