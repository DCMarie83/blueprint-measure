import { useState, useRef, Fragment } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import Modal from '../components/ui/Modal'
import { usePricingCategories } from '../hooks/usePricingCategories'
import { usePricingItems } from '../hooks/usePricingItems'
import MaterialsPricingTab from '../components/materials/MaterialsPricingTab'
import styles from './PricingPage.module.css'

const tabBtn = (active) => ({
  padding: '8px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  border: 'none', borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
  background: 'none', color: active ? 'var(--color-text, #1b2426)' : 'var(--color-text-muted)',
})

export default function PricingPage() {
  const { categories, loading: catLoading, createCategory, deleteCategory } = usePricingCategories()
  const { items, loading: itemLoading, createItem, updateItem, deleteItem } = usePricingItems()

  const [tab, setTab] = useState('estimate')
  const [expandedCategories, setExpandedCategories] = useState(new Set())
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [showAddItem, setShowAddItem] = useState(null) // category_id or null
  const [catForm, setCatForm] = useState({ name: '', trade_vertical: '' })
  const [itemForm, setItemForm] = useState({ name: '', unit: 'sf', default_rate: '', description: '' })

  // Inline rate editing.
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState(null)
  const skipBlurRef = useRef(false)  // suppress the blur commit that follows Enter/Escape

  function startEditRate(item) {
    setEditError(null)
    setEditingId(item.id)
    setEditValue(item.default_rate == null ? '' : String(item.default_rate))
  }

  function cancelEditRate() {
    setEditingId(null)
    setEditValue('')
    setEditError(null)
  }

  async function commitEditRate(item) {
    if (savingEdit) return
    const parsed = parseFloat(editValue)
    const nextRate = Number.isFinite(parsed) ? parsed : 0
    if (nextRate === Number(item.default_rate)) { cancelEditRate(); return }
    setSavingEdit(true)
    setEditError(null)
    try {
      await updateItem(item.id, { default_rate: nextRate })  // stamps source='user' in the hook
      setEditingId(null)
      setEditValue('')
    } catch (err) {
      setEditError(err.message || 'Could not save rate.')
    } finally {
      setSavingEdit(false)
    }
  }

  function toggleCategory(id) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function itemsForCategory(catId) {
    return items.filter(i => i.category_id === catId)
  }

  async function handleCreateCategory(e) {
    e.preventDefault()
    await createCategory({ name: catForm.name, trade_vertical: catForm.trade_vertical || null })
    setCatForm({ name: '', trade_vertical: '' })
    setShowAddCategory(false)
  }

  async function handleCreateItem(e) {
    e.preventDefault()
    await createItem({
      category_id: showAddItem,
      name: itemForm.name,
      unit: itemForm.unit,
      default_rate: parseFloat(itemForm.default_rate) || 0,
      description: itemForm.description || null,
    })
    setItemForm({ name: '', unit: 'sf', default_rate: '', description: '' })
    setShowAddItem(null)
  }

  async function handleDeleteCategory(id) {
    if (!window.confirm('Delete this category and all its items?')) return
    await deleteCategory(id)
  }

  async function handleDeleteItem(id) {
    if (!window.confirm('Delete this item?')) return
    await deleteItem(id)
  }

  function fmtRate(val) {
    if (val == null) return '--'
    return `$${Number(val).toFixed(2)}`
  }

  const loading = catLoading || itemLoading
  const hasSeeded = items.some(i => i.source === 'seeded')

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>Pricing Library</h1>
          {tab === 'estimate' && (
            <button className={styles.newBtn} onClick={() => setShowAddCategory(true)}>
              <Plus size={16} /> New Category
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
          <button style={tabBtn(tab === 'estimate')} onClick={() => setTab('estimate')}>Estimate Items</button>
          <button style={tabBtn(tab === 'materials')} onClick={() => setTab('materials')}>Materials</button>
        </div>

        {tab === 'materials' && <MaterialsPricingTab />}

        {tab === 'estimate' && hasSeeded && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
            Starter rates are examples. Edit one to make it yours, or let Smart Bid use your regional market data.
          </p>
        )}

        {tab === 'estimate' && (loading ? (
          <div className={styles.emptyState}>Loading...</div>
        ) : categories.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>Your pricing library is empty</h2>
            <p>Add categories and items to build your estimate templates.</p>
            <button className={styles.newBtn} onClick={() => setShowAddCategory(true)}>
              <Plus size={16} /> Add your first category
            </button>
          </div>
        ) : (
          categories.map(cat => {
            const catItems = itemsForCategory(cat.id)
            const expanded = expandedCategories.has(cat.id)
            return (
              <div key={cat.id} className={styles.categoryCard}>
                <div className={styles.categoryHeader} onClick={() => toggleCategory(cat.id)}>
                  {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <h3 className={styles.categoryName}>{cat.name}</h3>
                  <span className={styles.itemCount}>{catItems.length} item{catItems.length !== 1 ? 's' : ''}</span>
                  <button
                    className={styles.addItemBtn}
                    onClick={e => { e.stopPropagation(); setShowAddItem(cat.id) }}
                  >
                    <Plus size={14} /> Add Item
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id) }}
                    title="Delete category"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {expanded && (
                  catItems.length === 0 ? (
                    <div className={styles.emptyCategory}>Empty bowl — no items yet.</div>
                  ) : (
                    catItems.map(item => (
                      <Fragment key={item.id}>
                        <div className={styles.itemRow}>
                          <span className={styles.itemName}>{item.name}</span>
                          {item.source === 'seeded' && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-surface-2, #eef0f0)', color: 'var(--color-text-muted, #1B2426)', whiteSpace: 'nowrap' }}>Starter rate</span>
                          )}
                          <span className={styles.unitBadge}>{item.unit}</span>
                          <span className={styles.rateCell}>
                            {editingId === item.id ? (
                              <input
                                type="number" step="0.01" min="0"
                                value={editValue}
                                autoFocus
                                disabled={savingEdit}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { skipBlurRef.current = true; commitEditRate(item) }
                                  else if (e.key === 'Escape') { skipBlurRef.current = true; cancelEditRate() }
                                }}
                                onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return } commitEditRate(item) }}
                                style={{ width: '100%', textAlign: 'right', padding: '4px 6px', border: '1px solid var(--color-primary, #26464C)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box', opacity: savingEdit ? 0.6 : 1 }}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditRate(item)}
                                title="Edit rate"
                                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
                              >
                                <span className={styles.rateLabel}>Rate </span>{fmtRate(item.default_rate)}
                              </button>
                            )}
                          </span>
                          <button className={styles.deleteBtn} onClick={() => handleDeleteItem(item.id)} title="Delete item">
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {editingId === item.id && editError && (
                          <div style={{ padding: '0 18px 8px 48px', fontSize: 12, color: 'var(--color-danger, #e53e3e)' }}>{editError}</div>
                        )}
                      </Fragment>
                    ))
                  )
                )}
              </div>
            )
          })
        ))}
      </main>

      {showAddCategory && (
        <Modal title="New Category" onClose={() => setShowAddCategory(false)}>
          <form onSubmit={handleCreateCategory}>
            <div className={styles.modalField}>
              <label>Category Name</label>
              <input
                value={catForm.name}
                onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Interior Paint"
                required
                autoFocus
              />
            </div>
            <div className={styles.modalField}>
              <label>Trade Vertical (optional)</label>
              <input
                value={catForm.trade_vertical}
                onChange={e => setCatForm(f => ({ ...f, trade_vertical: e.target.value }))}
                placeholder="e.g. Painting"
              />
            </div>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setShowAddCategory(false)}>Cancel</button>
              <button type="submit">Create Category</button>
            </div>
          </form>
        </Modal>
      )}

      {showAddItem && (
        <Modal title="Add Item" onClose={() => setShowAddItem(null)}>
          <form onSubmit={handleCreateItem}>
            <div className={styles.modalField}>
              <label>Item Name</label>
              <input
                value={itemForm.name}
                onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Wall Paint - Standard"
                required
                autoFocus
              />
            </div>
            <div className={styles.modalField}>
              <label>Unit</label>
              <select value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}>
                <option value="sf">SF</option>
                <option value="lf">LF</option>
                <option value="each">Each</option>
                <option value="hour">Hour</option>
                <option value="lump_sum">Lump Sum</option>
              </select>
            </div>
            <div className={styles.rateFields}>
              <div className={styles.modalField}>
                <label>Good Rate *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemForm.default_rate}
                  onChange={e => setItemForm(f => ({ ...f, default_rate: e.target.value }))}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            <div className={styles.modalField}>
              <label>Description (optional)</label>
              <textarea
                value={itemForm.description}
                onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Notes about this item..."
              />
            </div>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setShowAddItem(null)}>Cancel</button>
              <button type="submit">Add Item</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
