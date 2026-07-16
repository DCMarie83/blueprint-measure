import { useState, useEffect, useMemo } from 'react'
import { Search, ChevronDown, ChevronRight, Check } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { supabase } from '../../lib/supabase'
import { SEGMENTS, unitLabel } from '../../lib/lite'
import styles from './lite.module.css'

// Mirrors the estimate PricingItemPicker pattern: search + group-by-category +
// multi-select. Reads the platform starter library scoped to the sub's trade
// (their trade_vertical plus shared 'common' items). Step 2 collects the sub's
// own rate for each picked item before batch-inserting into their GC catalog.
export default function WorkItemLibraryPicker({ tradeVertical, existingLibraryIds = [], onConfirm, onClose }) {
  const [library, setLibrary] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState('all')
  const [selected, setSelected] = useState({}) // libId -> item
  const [expandedCats, setExpandedCats] = useState(new Set())
  const [step, setStep] = useState('select') // 'select' | 'rates'
  const [rates, setRates] = useState({}) // libId -> string
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const verticals = tradeVertical ? [tradeVertical, 'common'] : ['common']
      const { data, error: err } = await supabase
        .from('work_item_library')
        .select('*')
        .eq('is_active', true)
        .in('trade_vertical', verticals)
        .order('category', { ascending: true })
        .order('name', { ascending: true })
      if (cancelled) return
      if (err) setError(err.message)
      else setLibrary(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [tradeVertical])

  const existing = useMemo(() => new Set(existingLibraryIds), [existingLibraryIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return library.filter(i => {
      if (existing.has(i.id)) return false
      if (segment !== 'all' && i.segment && i.segment !== 'all' && i.segment !== 'common' && i.segment !== segment) return false
      if (!q) return true
      return i.name?.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)
    })
  }, [library, search, segment, existing])

  const grouped = useMemo(() => {
    const map = {}
    for (const item of filtered) {
      const cat = item.category || 'Uncategorized'
      if (!map[cat]) map[cat] = []
      map[cat].push(item)
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  function toggleCat(cat) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function toggleItem(item) {
    setSelected(prev => {
      const next = { ...prev }
      if (next[item.id]) delete next[item.id]
      else next[item.id] = item
      return next
    })
  }

  const selectedList = Object.values(selected)

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    try {
      const rows = selectedList.map(item => ({
        library_item_id: item.id,
        category: item.category || null,
        name: item.name,
        unit: item.unit,
        segment: item.segment || null,
        rate: rates[item.id] === '' || rates[item.id] == null ? null : parseFloat(rates[item.id]),
        is_active: true,
      }))
      await onConfirm(rows)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={step === 'select' ? 'Add from library' : 'Set your rates'} onClose={onClose}>
      {error && <div className={styles.error}>{error}</div>}

      {step === 'select' && (
        <>
          <div className={styles.segmentChips}>
            {SEGMENTS.map(s => (
              <button key={s.value} className={`${styles.chip} ${segment === s.value ? styles.chipActive : ''}`} onClick={() => setSegment(s.value)}>
                {s.label}
              </button>
            ))}
          </div>

          <div className={styles.field} style={{ marginBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--color-text-muted)' }} />
              <input className={styles.input} style={{ paddingLeft: 32 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" autoFocus />
            </div>
          </div>

          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {loading ? (
              <div className={styles.loading}>Loading library…</div>
            ) : grouped.length === 0 ? (
              <div className={styles.empty}>{library.length === 0 ? 'No library items available for your trade yet.' : 'No items match your search.'}</div>
            ) : (
              grouped.map(([cat, items]) => {
                const expanded = expandedCats.has(cat) || search.trim() !== ''
                return (
                  <div key={cat} style={{ marginBottom: 6 }}>
                    <button className={styles.secondaryBtn} style={{ width: '100%', justifyContent: 'flex-start', border: 'none' }} onClick={() => toggleCat(cat)}>
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {cat} <span className={styles.muted}>({items.length})</span>
                    </button>
                    {expanded && items.map(item => {
                      const isSel = !!selected[item.id]
                      return (
                        <div key={item.id} className={styles.entryRow} onClick={() => toggleItem(item)} style={{ cursor: 'pointer' }}>
                          <div className={styles.entryMain}>
                            <div className={styles.entryName}>{item.name}</div>
                            <div className={styles.entryMeta}>{unitLabel(item.unit)}{item.billing_note ? ` · ${item.billing_note}` : ''}</div>
                          </div>
                          <span className={styles.iconBtn} style={{ color: isSel ? 'var(--color-action-open)' : 'var(--color-border)' }}>
                            <Check size={18} />
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <div className={styles.rowBetween} style={{ marginTop: 14 }}>
            <span className={styles.muted}>{selectedList.length} selected</span>
            <button className={styles.primaryBtn} disabled={selectedList.length === 0} onClick={() => setStep('rates')}>
              Next: set rates
            </button>
          </div>
        </>
      )}

      {step === 'rates' && (
        <>
          <p className={styles.helper} style={{ marginBottom: 12 }}>Enter your rate for each item. You can leave a rate blank and set it later.</p>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {selectedList.map(item => (
              <div key={item.id} className={styles.entryRow}>
                <div className={styles.entryMain}>
                  <div className={styles.entryName}>{item.name}</div>
                  <div className={styles.entryMeta}>{unitLabel(item.unit)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className={styles.muted}>$</span>
                  <input
                    className={styles.input}
                    style={{ width: 90 }}
                    type="number" step="0.01" min="0"
                    value={rates[item.id] ?? ''}
                    onChange={e => setRates(prev => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className={styles.rowBetween} style={{ marginTop: 14 }}>
            <button className={styles.secondaryBtn} onClick={() => setStep('select')}>Back</button>
            <button className={styles.primaryBtn} disabled={saving} onClick={handleConfirm}>
              {saving ? 'Adding…' : `Add ${selectedList.length} item${selectedList.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
