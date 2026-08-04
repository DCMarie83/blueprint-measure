import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Plus, Trash2, Library } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import WorkItemLibraryPicker from './WorkItemLibraryPicker'
import { useClient } from '../../hooks/useClient'
import { useWorkItems } from '../../hooks/useWorkItems'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { LITE_UNITS, unitLabel } from '../../lib/lite'
import styles from './lite.module.css'

function AddCustomItemModal({ onSave, onClose }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('each')
  const [rate, setRate] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError(t('lite:catalog.nameRequired')); return }
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
    <Modal title={t('lite:catalog.addCustomItem')} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.field} style={{ marginBottom: 10 }}>
          <span className={styles.fieldLabel}>{t('lite:catalog.name')}</span>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder={t('lite:catalog.namePh')} autoFocus />
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('lite:catalog.unit')}</span>
            <select className={styles.select} value={unit} onChange={e => setUnit(e.target.value)}>
              {LITE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('lite:catalog.yourRate')}</span>
            <input className={styles.input} type="number" step="0.01" min="0" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className={styles.field} style={{ marginBottom: 14 }}>
          <span className={styles.fieldLabel}>{t('lite:catalog.category')}</span>
          <input className={styles.input} value={category} onChange={e => setCategory(e.target.value)} placeholder={t('lite:catalog.categoryPh')} />
        </div>
        <div className={styles.rowBetween}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>{t('common:action.cancel')}</button>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>{saving ? t('lite:catalog.adding') : t('lite:catalog.addItem')}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function GCCatalogPage() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { client } = useClient(clientId)
  const { company } = useEffectiveCompany()
  const { items, loading, createItem, createManyItems, updateItem, deleteItem } = useWorkItems(clientId)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [rateDrafts, setRateDrafts] = useState({})

  const grouped = useMemo(() => {
    const map = {}
    for (const item of items) {
      const cat = item.category || t('lite:catalog.uncategorized')
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
    if (parsed !== item.rate) updateItem(item.id, { rate: parsed }).catch(err => alert(t('lite:catalog.updateRateFailed', { message: err.message })))
  }

  async function handleLibraryConfirm(rows) {
    await createManyItems(rows)
    setShowLibrary(false)
  }

  async function handleCustomSave(payload) {
    await createItem(payload)
    setShowCustom(false)
  }

  const gcName = client?.business_name || client?.display_name || t('lite:catalog.gc')

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <button className={styles.backLink} onClick={() => navigate('/gcs')}><ChevronLeft size={15} /> {t('lite:catalog.gcs')}</button>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{gcName}</h1>
            <p className={styles.subtitle}>{t('lite:catalog.subtitle')}</p>
          </div>
        </div>

        <div className={styles.fieldRow} style={{ marginBottom: 14 }}>
          <button className={styles.primaryBtn} onClick={() => setShowLibrary(true)}><Library size={16} /> {t('lite:catalog.addFromLibrary')}</button>
          <button className={styles.secondaryBtn} onClick={() => setShowCustom(true)}><Plus size={16} /> {t('lite:catalog.addCustomItem')}</button>
        </div>

        {loading ? (
          <div className={styles.loading}>{t('lite:catalog.loading')}</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <Library size={40} />
            <div className={styles.emptyTitle}>{t('lite:catalog.emptyTitle')}</div>
            <p>{t('lite:catalog.emptyHelp')}</p>
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
                        aria-label={t('lite:catalog.yourRateAria')}
                        value={rateDrafts[item.id] ?? (item.rate ?? '')}
                        onChange={e => setRateDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                        onBlur={() => commitRate(item)}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={t('lite:catalog.active')}>
                      <input type="checkbox" checked={!!item.is_active} onChange={e => updateItem(item.id, { is_active: e.target.checked })} />
                    </label>
                    <button className={styles.iconBtn} aria-label={t('lite:catalog.deleteItem')} onClick={() => { if (window.confirm(t('lite:catalog.deleteItemConfirm', { name: item.name }))) deleteItem(item.id) }}>
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
