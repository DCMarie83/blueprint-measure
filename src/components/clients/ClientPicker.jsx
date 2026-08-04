import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Home, Building2, HardHat, X } from 'lucide-react'
import styles from './ClientPicker.module.css'

function typeIcon(type, size = 14) {
  if (type === 'general_contractor') return <HardHat size={size} />
  if (type === 'commercial') return <Building2 size={size} />
  return <Home size={size} />
}

export default function ClientPicker({ clients, value, onChange, placeholder }) {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t('clients:picker.searchPlaceholder')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = value ? clients.find(c => c.id === value) : null

  const filtered = (clients || []).filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (c.display_name?.toLowerCase().includes(q) || c.business_name?.toLowerCase().includes(q) || c.primary_email?.toLowerCase().includes(q))
  }).slice(0, 8)

  function handleSelect(clientId) {
    onChange(clientId)
    setSearch('')
    setOpen(false)
  }

  if (selected) {
    return (
      <div className={styles.selected}>
        <span className={styles.selectedIcon}>
          {typeIcon(selected.client_type)}
        </span>
        <span className={styles.selectedName}>{selected.display_name}</span>
        <button type="button" className={styles.clearBtn} onClick={() => onChange(null)} aria-label={t('clients:picker.clearSelection')}>
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className={styles.wrap} ref={ref}>
      <input
        className={styles.input}
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={resolvedPlaceholder}
      />
      {open && filtered.length > 0 && (
        <div className={styles.dropdown}>
          {filtered.map(c => (
            <div key={c.id} className={styles.row} onClick={() => handleSelect(c.id)}>
              <span className={styles.rowIcon}>
                {typeIcon(c.client_type)}
              </span>
              <div className={styles.rowInfo}>
                <span className={styles.rowName}>{c.display_name}</span>
                {c.business_name && (c.client_type === 'commercial' || c.client_type === 'general_contractor') && (
                  <span className={styles.rowSub}>{c.business_name}</span>
                )}
                {c.primary_email && <span className={styles.rowSub}>{c.primary_email}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && search && (
        <div className={styles.dropdown}>
          <div className={styles.empty}>{t('clients:picker.noMatch')}</div>
        </div>
      )}
    </div>
  )
}
