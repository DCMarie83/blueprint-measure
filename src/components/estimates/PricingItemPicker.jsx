import { useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import Modal from '../ui/Modal'
import styles from './PricingItemPicker.module.css'

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }
const ZONE_UNIT_LABELS = { SF: 'SF', LF: 'LF', count: 'units' }

export default function PricingItemPicker({ zone, categories, items, onPick, onClose }) {
  const [search, setSearch] = useState('')
  const [expandedCats, setExpandedCats] = useState(new Set())

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.pricing_categories?.name || '').toLowerCase().includes(q)
    )
  }, [items, search])

  // Group filtered items by category
  const grouped = useMemo(() => {
    const map = {}
    for (const item of filtered) {
      const catId = item.category_id
      if (!map[catId]) {
        const cat = categories.find(c => c.id === catId)
        map[catId] = { name: cat?.name || 'Uncategorized', sortOrder: cat?.sort_order ?? 999, items: [] }
      }
      map[catId].items.push(item)
    }
    return Object.entries(map).sort((a, b) => a[1].sortOrder - b[1].sortOrder)
  }, [filtered, categories])

  function toggleCat(catId) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(catId) ? next.delete(catId) : next.add(catId)
      return next
    })
  }

  function fmtRate(val) {
    if (val == null) return '--'
    return `$${Number(val).toFixed(2)}`
  }

  const modalTitle = zone
    ? `Add Line Item for: ${zone.display_name} — ${zone.total_result.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${ZONE_UNIT_LABELS[zone.measurement_type] || zone.measurement_type}`
    : 'Add Line Item from Pricing Library'

  return (
    <Modal title={modalTitle} onClose={onClose}>
      <div className={styles.searchWrap}>
        <Search size={15} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items..."
          autoFocus
        />
      </div>

      <div className={styles.list}>
        {grouped.length === 0 ? (
          <div className={styles.empty}>
            {items.length === 0
              ? 'No pricing items found. Add items in the Pricing Library first.'
              : 'No items match your search.'}
          </div>
        ) : (
          grouped.map(([catId, { name, items: catItems }]) => {
            const expanded = expandedCats.has(catId) || search.trim() !== ''
            return (
              <div key={catId} className={styles.catGroup}>
                <button className={styles.catHeader} onClick={() => toggleCat(catId)}>
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className={styles.catName}>{name}</span>
                  <span className={styles.catCount}>{catItems.length}</span>
                </button>
                {expanded && catItems.map(item => (
                  <div key={item.id} className={styles.itemRow}>
                    <div className={styles.itemInfo}>
                      <span className={styles.itemName}>{item.name}</span>
                      <span className={styles.itemMeta}>
                        <span className={styles.unitBadge}>{UNIT_LABELS[item.unit] || item.unit}</span>
                        <span className={styles.rates}>
                          {fmtRate(item.default_rate)}
                        </span>
                      </span>
                    </div>
                    <button
                      className={styles.pickBtn}
                      onClick={() => onPick(item)}
                      title="Add to estimate"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
