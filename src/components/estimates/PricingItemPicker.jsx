import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import Modal from '../ui/Modal'
import styles from './PricingItemPicker.module.css'

const UNIT_KEYS = { sf: 'common:units.sf', lf: 'common:units.lf', each: 'common:units.each', hour: 'common:units.hour', lump_sum: 'common:units.lumpSum' }
const ZONE_UNIT_KEYS = { SF: 'common:units.sf', LF: 'common:units.lf', count: 'common:units.count' }

export default function PricingItemPicker({ zone, categories, items, onPick, onClose }) {
  const { t } = useTranslation()
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
    ? t('estimates:pricing.addLineItemForZone', {
        name: zone.display_name,
        amount: zone.total_result.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        unit: ZONE_UNIT_KEYS[zone.measurement_type] ? t(ZONE_UNIT_KEYS[zone.measurement_type]) : zone.measurement_type,
      })
    : t('estimates:pricing.addLineItemTitle')

  return (
    <Modal title={modalTitle} onClose={onClose}>
      <div className={styles.searchWrap}>
        <Search size={15} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('estimates:pricing.searchPlaceholder')}
          autoFocus
        />
      </div>

      <div className={styles.list}>
        {grouped.length === 0 ? (
          <div className={styles.empty}>
            {items.length === 0
              ? t('estimates:pricing.emptyNoItems')
              : t('estimates:pricing.emptyNoMatch')}
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
                        <span className={styles.unitBadge}>{UNIT_KEYS[item.unit] ? t(UNIT_KEYS[item.unit]) : item.unit}</span>
                        <span className={styles.rates}>
                          {fmtRate(item.default_rate)}
                        </span>
                      </span>
                    </div>
                    <button
                      className={styles.pickBtn}
                      onClick={() => onPick(item)}
                      title={t('estimates:pricing.addToEstimate')}
                    >
                      <Plus size={14} /> {t('common:action.add')}
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
