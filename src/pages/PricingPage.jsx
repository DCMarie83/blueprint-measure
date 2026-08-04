import { useState, useRef, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import Modal from '../components/ui/Modal'
import { useAuth } from '../context/AuthContext'
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
  const { userProfile, isSuperAdmin } = useAuth()
  const { t } = useTranslation()
  const isAdmin = userProfile?.role === 'contractor_admin' || isSuperAdmin

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
      setEditError(err.message || t('pricing:estimate.saveRateFailed'))
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
    if (!window.confirm(t('pricing:confirm.deleteCategory'))) return
    await deleteCategory(id)
  }

  async function handleDeleteItem(id) {
    if (!window.confirm(t('pricing:confirm.deleteItem'))) return
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
      
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>{t('pricing:header.title')}</h1>
          {tab === 'estimate' && isAdmin && (
            <button className={styles.newBtn} onClick={() => setShowAddCategory(true)}>
              <Plus size={16} /> {t('pricing:actions.newCategory')}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--color-border)', marginBottom: 20 }}>
          <button style={tabBtn(tab === 'estimate')} onClick={() => setTab('estimate')}>{t('pricing:tabs.estimate')}</button>
          <button style={tabBtn(tab === 'materials')} onClick={() => setTab('materials')}>{t('pricing:tabs.materials')}</button>
        </div>

        {tab === 'materials' && <MaterialsPricingTab />}

        {tab === 'estimate' && hasSeeded && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
            {t('pricing:estimate.starterNote')}
          </p>
        )}

        {tab === 'estimate' && (loading ? (
          <div className={styles.emptyState}>{t('pricing:estimate.loading')}</div>
        ) : categories.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>{t('pricing:estimate.emptyTitle')}</h2>
            <p>{t('pricing:estimate.emptyBody')}</p>
            {isAdmin && (
              <button className={styles.newBtn} onClick={() => setShowAddCategory(true)}>
                <Plus size={16} /> {t('pricing:actions.addFirstCategory')}
              </button>
            )}
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
                  <span className={styles.itemCount}>{t('pricing:estimate.itemCount', { count: catItems.length })}</span>
                  {isAdmin && (
                    <button
                      className={styles.addItemBtn}
                      onClick={e => { e.stopPropagation(); setShowAddItem(cat.id) }}
                    >
                      <Plus size={14} /> {t('pricing:actions.addItem')}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      className={styles.deleteBtn}
                      onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id) }}
                      title={t('pricing:actions.deleteCategory')}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {expanded && (
                  catItems.length === 0 ? (
                    <div className={styles.emptyCategory}>{t('pricing:estimate.emptyCategory')}</div>
                  ) : (
                    catItems.map(item => (
                      <Fragment key={item.id}>
                        <div className={styles.itemRow}>
                          <span className={styles.itemName}>{item.name}</span>
                          {item.source === 'seeded' && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-surface-2, #eef0f0)', color: 'var(--color-text-muted, #1B2426)', whiteSpace: 'nowrap' }}>{t('pricing:estimate.starterRate')}</span>
                          )}
                          <span className={styles.unitBadge}>{item.unit}</span>
                          <span className={styles.rateCell}>
                            {!isAdmin ? (
                              <span><span className={styles.rateLabel}>{t('pricing:estimate.rateLabel')}</span>{fmtRate(item.default_rate)}</span>
                            ) : editingId === item.id ? (
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
                                title={t('pricing:actions.editRate')}
                                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
                              >
                                <span className={styles.rateLabel}>{t('pricing:estimate.rateLabel')}</span>{fmtRate(item.default_rate)}
                              </button>
                            )}
                          </span>
                          {isAdmin && (
                            <button className={styles.deleteBtn} onClick={() => handleDeleteItem(item.id)} title={t('pricing:actions.deleteItem')}>
                              <Trash2 size={15} />
                            </button>
                          )}
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
        <Modal title={t('pricing:actions.newCategory')} onClose={() => setShowAddCategory(false)}>
          <form onSubmit={handleCreateCategory}>
            <div className={styles.modalField}>
              <label>{t('pricing:modal.categoryName')}</label>
              <input
                value={catForm.name}
                onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('pricing:modal.categoryNamePlaceholder')}
                required
                autoFocus
              />
            </div>
            <div className={styles.modalField}>
              <label>{t('pricing:modal.tradeVertical')}</label>
              <input
                value={catForm.trade_vertical}
                onChange={e => setCatForm(f => ({ ...f, trade_vertical: e.target.value }))}
                placeholder={t('pricing:modal.tradeVerticalPlaceholder')}
              />
            </div>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setShowAddCategory(false)}>{t('common:action.cancel')}</button>
              <button type="submit">{t('pricing:actions.createCategory')}</button>
            </div>
          </form>
        </Modal>
      )}

      {showAddItem && (
        <Modal title={t('pricing:actions.addItem')} onClose={() => setShowAddItem(null)}>
          <form onSubmit={handleCreateItem}>
            <div className={styles.modalField}>
              <label>{t('pricing:modal.itemName')}</label>
              <input
                value={itemForm.name}
                onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('pricing:modal.itemNamePlaceholder')}
                required
                autoFocus
              />
            </div>
            <div className={styles.modalField}>
              <label>{t('pricing:modal.unit')}</label>
              <select value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}>
                <option value="sf">{t('common:units.sf')}</option>
                <option value="lf">{t('common:units.lf')}</option>
                <option value="each">{t('common:units.each')}</option>
                <option value="hour">{t('common:units.hour')}</option>
                <option value="lump_sum">{t('common:units.lumpSum')}</option>
              </select>
            </div>
            <div className={styles.rateFields}>
              <div className={styles.modalField}>
                <label>{t('pricing:modal.goodRate')}</label>
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
              <label>{t('pricing:modal.description')}</label>
              <textarea
                value={itemForm.description}
                onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                placeholder={t('pricing:modal.descriptionPlaceholder')}
              />
            </div>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setShowAddItem(null)}>{t('common:action.cancel')}</button>
              <button type="submit">{t('pricing:actions.addItem')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
