import { useState } from 'react'
import styles from './ZoneList.module.css'

const TYPE_COLORS = {
  SF: '#2e8bff',
  LF: '#22c55e',
  count: '#f59e0b',
}

const SURFACE_TYPES = ['Wall', 'Ceiling', 'Trim', 'Door', 'Window', 'Cabinet', 'Floor', 'Exterior', 'Other']

export default function ZoneList({ zones, onDelete, onUpdate, onRedraw, redrawingZoneId }) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSurfaceType, setEditSurfaceType] = useState('')
  const [editCoatCount, setEditCoatCount] = useState(1)
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit(zone) {
    setEditingId(zone.id)
    setEditName(zone.name)
    setEditDescription(zone.description ?? '')
    setEditSurfaceType(zone.surface_type ?? '')
    setEditCoatCount(zone.coat_count ?? 1)
    setEditNotes(zone.notes ?? '')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleSave(zoneId) {
    if (!editName.trim()) return
    setSaving(true)
    try {
      await onUpdate(zoneId, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        surface_type: editSurfaceType || null,
        coat_count: editCoatCount,
        notes: editNotes.trim() || null,
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
          <div key={zone.id} className={`${styles.zone} ${isRedrawing ? styles.zoneRedrawing : ''}`}>
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
                <textarea
                  className={styles.editTextarea}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                />
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
                      zone.surface_type,
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
