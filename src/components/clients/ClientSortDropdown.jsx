import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import styles from './ClientSortDropdown.module.css'

const OPTIONS = [
  { value: 'recent_activity', label: 'clients:sort.recentActivity' },
  { value: 'name_az', label: 'clients:sort.nameAz' },
  { value: 'lifetime_value', label: 'clients:sort.lifetimeValue' },
  { value: 'last_contact', label: 'clients:sort.lastActivity' },
]

export default function ClientSortDropdown({ value, onChange }) {
  const { t } = useTranslation()
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
        {t(current.label)} <ChevronDown size={14} />
      </button>
      {open && (
        <div className={styles.menu}>
          {OPTIONS.map(o => (
            <button
              key={o.value}
              className={`${styles.option} ${o.value === value ? styles.optionActive : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {t(o.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
