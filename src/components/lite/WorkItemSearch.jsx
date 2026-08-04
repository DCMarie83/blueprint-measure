import { useState, useEffect, useMemo, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { unitLabel, fmtMoney } from '../../lib/lite'
import styles from '../../pages/lite/lite.module.css'

// Shared merged type-ahead for both Lite composer modes — one component, two
// modes. Piece mode searches the full GC catalog plus the platform library,
// minus unit='hour' rows (those belong to hourly). Hourly mode restricts BOTH
// sections to unit='hour'. The final dropdown row is always an explicit
// free-text escape whose label differs by mode: piece adds a custom catalog
// item; hourly keeps the typed text as a plain description (no forced item).
//
// The component owns its own search/debounce state, so it resets cleanly every
// time the caller unmounts it on a pick. The forwarded ref targets the input,
// letting the caller focus it (e.g. arriving from /log?job=<id>).
const WorkItemSearch = forwardRef(function WorkItemSearch({
  mode, catalog, library,
  onPickCatalog, onPickLibrary, onPickCustom,
  label, placeholder,
}, ref) {
  const { t } = useTranslation()
  const lbl = label ?? t('lite:components.searchLabel')
  const ph = placeholder ?? t('lite:components.searchPlaceholder')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const hourly = mode === 'hourly'

  // Debounce the box (250ms); nothing searches under 2 chars.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])

  // Merged results: GC catalog first (capped 5), then library minus items already
  // in this GC's catalog (capped 6). Case-insensitive substring on name OR
  // category, so a category-word search ('interior', 'trim') surfaces every item
  // in that group. Hourly keeps only unit='hour'; piece trims unit='hour' out of
  // the library section.
  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (q.length < 2) return { catalog: [], library: [] }
    const matches = r => (r.name?.toLowerCase().includes(q)) || (r.category?.toLowerCase().includes(q))
    const active = catalog.filter(i => i.is_active)
    const catMatches = active
      .filter(i => (!hourly || i.unit === 'hour') && matches(i))
      .slice(0, 5)
    const existingLibIds = new Set(catalog.map(i => i.library_item_id).filter(Boolean))
    const libMatches = library
      .filter(l => !existingLibIds.has(l.id)
        && (hourly ? l.unit === 'hour' : l.unit !== 'hour')
        && matches(l))
      .slice(0, 6)
    return { catalog: catMatches, library: libMatches }
  }, [debounced, catalog, library, hourly])

  const typed = debounced.trim()

  return (
    <div className={styles.field} style={{ marginBottom: 0 }}>
      <span className={styles.fieldLabel}>{lbl}</span>
      <input
        ref={ref}
        className={styles.input}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={ph}
      />
      {typed.length >= 2 && (
        <div className={styles.searchResults}>
          {results.catalog.length > 0 && <div className={styles.searchSection}>{t('lite:components.yourCatalog')}</div>}
          {results.catalog.map(i => (
            <button key={i.id} type="button" className={styles.searchItem} onClick={() => onPickCatalog(i)}>
              <span className={styles.searchName}>{i.name}</span>
              <span className={styles.searchMeta}>{i.category ? `${i.category} · ` : ''}{unitLabel(i.unit)} · {fmtMoney(i.rate)}</span>
            </button>
          ))}
          {results.library.length > 0 && <div className={styles.searchSection}>{t('lite:components.searchAddFromLibrary')}</div>}
          {results.library.map(l => (
            <button key={l.id} type="button" className={styles.searchItem} onClick={() => onPickLibrary(l)}>
              <span className={styles.searchName}>{l.name}</span>
              <span className={styles.searchMeta}>{l.category ? `${l.category} · ` : ''}{unitLabel(l.unit)}{l.billing_note ? ` · ${l.billing_note}` : ''}</span>
            </button>
          ))}
          <button type="button" className={styles.searchItem} onClick={() => onPickCustom(typed)}>
            <span className={styles.searchName}>
              {hourly ? t('lite:components.useAsDescription', { text: typed }) : t('lite:components.addAsCustom', { text: typed })}
            </span>
          </button>
        </div>
      )}
    </div>
  )
})

export default WorkItemSearch
