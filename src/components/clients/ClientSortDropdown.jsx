import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import styles from './ClientSortDropdown.module.css'

const OPTIONS = [
  { value: 'recent_activity', label: 'Recent activity' },
  { value: 'name_az', label: 'Name A-Z' },
  { value: 'lifetime_value', label: 'Lifetime value' },
  { value: 'last_contact', label: 'Last contact' },
]

export default function ClientSortDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = OPTIONS.find(o => o.value === value) ?? OPTIONS[0]

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(v => !v)}>
        {current.label} <ChevronDown size={14} />
      </button>
      {open && (
        <div className={styles.menu}>
          {OPTIONS.map(o => (
            <button
              key={o.value}
              className={`${styles.option} ${o.value === value ? styles.optionActive : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
