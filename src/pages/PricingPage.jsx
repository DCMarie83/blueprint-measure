import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import Modal from '../components/ui/Modal'
import { usePricingCategories } from '../hooks/usePricingCategories'
import { usePricingItems } from '../hooks/usePricingItems'
import styles from './PricingPage.module.css'

export default function PricingPage() {
  const { categories, loading: catLoading, createCategory, deleteCategory } = usePricingCategories()
  const { items, loading: itemLoading, createItem, deleteItem } = usePricingItems()

  const [expandedCategories, setExpandedCategories] = useState(new Set())
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [showAddItem, setShowAddItem] = useState(null) // category_id or null
  const [catForm, setCatForm] = useState({ name: '', trade_vertical: '' })
  const [itemForm, setItemForm] = useState({ name: '', unit: 'sf', default_rate: '', default_rate_better: '', default_rate_best: '', description: '' })

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
      default_rate_better: itemForm.default_rate_better ? parseFloat(itemForm.default_rate_better) : null,
      default_rate_best: itemForm.default_rate_best ? parseFloat(itemForm.default_rate_best) : null,
      description: itemForm.description || null,
    })
    setItemForm({ name: '', unit: 'sf', default_rate: '', default_rate_better: '', default_rate_best: '', description: '' })
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

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>Pricing Library</h1>
          <button className={styles.newBtn} onClick={() => setShowAddCategory(true)}>
            <Plus size={16} /> New Category
          </button>
        </div>

        {loading ? (
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
                      <div key={item.id} className={styles.itemRow}>
                        <span className={styles.itemName}>{item.name}</span>
                        <span className={styles.unitBadge}>{item.unit}</span>
                        <span className={styles.rateCell}>
                          <span className={styles.rateLabel}>Good </span>{fmtRate(item.default_rate)}
                        </span>
                        <span className={styles.rateCell}>
                          <span className={styles.rateLabel}>Better </span>{fmtRate(item.default_rate_better)}
                        </span>
                        <span className={styles.rateCell}>
                          <span className={styles.rateLabel}>Best </span>{fmtRate(item.default_rate_best)}
                        </span>
                        <button className={styles.deleteBtn} onClick={() => handleDeleteItem(item.id)} title="Delete item">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))
                  )
                )}
              </div>
            )
          })
        )}
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
              <div className={styles.modalField}>
                <label>Better Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemForm.default_rate_better}
                  onChange={e => setItemForm(f => ({ ...f, default_rate_better: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className={styles.modalField}>
                <label>Best Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemForm.default_rate_best}
                  onChange={e => setItemForm(f => ({ ...f, default_rate_best: e.target.value }))}
                  placeholder="0.00"
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
