import { useState, useRef, useEffect } from 'react'
import { Home, Building2, X } from 'lucide-react'
import styles from './ClientPicker.module.css'

export default function ClientPicker({ clients, value, onChange, placeholder = 'Search clients...' }) {
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
          {selected.client_type === 'commercial' ? <Building2 size={14} /> : <Home size={14} />}
        </span>
        <span className={styles.selectedName}>{selected.display_name}</span>
        <button type="button" className={styles.clearBtn} onClick={() => onChange(null)} aria-label="Clear selection">
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
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div className={styles.dropdown}>
          {filtered.map(c => (
            <div key={c.id} className={styles.row} onClick={() => handleSelect(c.id)}>
              <span className={styles.rowIcon}>
                {c.client_type === 'commercial' ? <Building2 size={14} /> : <Home size={14} />}
              </span>
              <div className={styles.rowInfo}>
                <span className={styles.rowName}>{c.display_name}</span>
                {c.business_name && c.client_type === 'commercial' && (
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
          <div className={styles.empty}>No matching clients</div>
        </div>
      )}
    </div>
  )
}
