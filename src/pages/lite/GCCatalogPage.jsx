import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Library } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import WorkItemLibraryPicker from './WorkItemLibraryPicker'
import { useClient } from '../../hooks/useClient'
import { useWorkItems } from '../../hooks/useWorkItems'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { LITE_UNITS, unitLabel } from '../../lib/lite'
import styles from './lite.module.css'

function AddCustomItemModal({ onSave, onClose }) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('each')
  const [rate, setRate] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({
        library_item_id: null,
        name: name.trim(),
        unit,
        category: category.trim() || null,
        segment: null,
        rate: rate === '' ? null : parseFloat(rate),
        is_active: true,
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Add custom item" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.field} style={{ marginBottom: 10 }}>
          <span className={styles.fieldLabel}>Name</span>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Hang & finish drywall" autoFocus />
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Unit</span>
            <select className={styles.select} value={unit} onChange={e => setUnit(e.target.value)}>
              {LITE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Your rate ($)</span>
            <input className={styles.input} type="number" step="0.01" min="0" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className={styles.field} style={{ marginBottom: 14 }}>
          <span className={styles.fieldLabel}>Category</span>
          <input className={styles.input} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Drywall" />
        </div>
        <div className={styles.rowBetween}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? 'Adding…' : 'Add item'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function GCCatalogPage() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { client } = useClient(clientId)
  const { company } = useEffectiveCompany()
  const { items, loading, createItem, createManyItems, updateItem, deleteItem } = useWorkItems(clientId)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [rateDrafts, setRateDrafts] = useState({})

  const grouped = useMemo(() => {
    const map = {}
    for (const item of items) {
      const cat = item.category || 'Uncategorized'
      if (!map[cat]) map[cat] = []
      map[cat].push(item)
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const existingLibraryIds = items.map(i => i.library_item_id).filter(Boolean)

  function commitRate(item) {
    const draft = rateDrafts[item.id]
    if (draft === undefined) return
    const parsed = draft === '' ? null : parseFloat(draft)
    setRateDrafts(prev => { const n = { ...prev }; delete n[item.id]; return n })
    if (parsed !== item.rate) updateItem(item.id, { rate: parsed }).catch(err => alert('Failed to update rate: ' + err.message))
  }

  async function handleLibraryConfirm(rows) {
    await createManyItems(rows)
    setShowLibrary(false)
  }

  async function handleCustomSave(payload) {
    await createItem(payload)
    setShowCustom(false)
  }

  const gcName = client?.business_name || client?.display_name || 'GC'

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <button className={styles.backLink} onClick={() => navigate('/gcs')}><ChevronLeft size={15} /> GCs</button>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{gcName}</h1>
            <p className={styles.subtitle}>Catalog &amp; your rates</p>
          </div>
        </div>

        <div className={styles.fieldRow} style={{ marginBottom: 14 }}>
          <button className={styles.primaryBtn} onClick={() => setShowLibrary(true)}><Library size={16} /> Add from library</button>
          <button className={styles.secondaryBtn} onClick={() => setShowCustom(true)}><Plus size={16} /> Add custom item</button>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading catalog…</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <Library size={40} />
            <div className={styles.emptyTitle}>No catalog items yet</div>
            <p>Add items from the library or create your own to start logging work for this GC.</p>
          </div>
        ) : (
          grouped.map(([cat, catItems]) => (
            <div key={cat} className={styles.card}>
              <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>{cat}</div>
              {catItems.map(item => (
                <div key={item.id} className={styles.entryRow}>
                  <div className={styles.entryMain}>
                    <div className={styles.entryName} style={{ opacity: item.is_active ? 1 : 0.5 }}>{item.name}</div>
                    <div className={styles.entryMeta}>{unitLabel(item.unit)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className={styles.muted}>$</span>
                      <input
                        className={styles.input}
                        style={{ width: 84 }}
                        type="number" step="0.01" min="0"
                        aria-label="Your rate"
                        value={rateDrafts[item.id] ?? (item.rate ?? '')}
                        onChange={e => setRateDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                        onBlur={() => commitRate(item)}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Active">
                      <input type="checkbox" checked={!!item.is_active} onChange={e => updateItem(item.id, { is_active: e.target.checked })} />
                    </label>
                    <button className={styles.iconBtn} aria-label="Delete item" onClick={() => { if (window.confirm(`Delete "${item.name}"?`)) deleteItem(item.id) }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </main>

      {showLibrary && (
        <WorkItemLibraryPicker
          tradeVertical={company?.trade_vertical}
          existingLibraryIds={existingLibraryIds}
          onConfirm={handleLibraryConfirm}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {showCustom && (
        <AddCustomItemModal onSave={handleCustomSave} onClose={() => setShowCustom(false)} />
      )}
    </div>
  )
}
