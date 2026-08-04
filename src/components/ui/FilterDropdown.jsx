import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import styles from './FilterDropdown.module.css'

export default function FilterDropdown({ label, value, options, onChange }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selectedLabel = value !== 'all' ? options.find(o => o.value === value)?.label : null
  const isActive = value !== 'all'

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={`${styles.trigger} ${isActive ? styles.triggerActive : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <span>{selectedLabel ? `${label}: ${selectedLabel}` : label}</span>
        <ChevronDown size={14} className={open ? styles.chevronOpen : ''} />
      </button>
      {open && (
        <div className={styles.panel}>
          <div
            className={`${styles.option} ${value === 'all' ? styles.optionSelected : ''}`}
            onClick={() => { onChange('all'); setOpen(false) }}
          >
            {t('ui:filterDropdown.all', { label })}
          </div>
          {options.map(opt => (
            <div
              key={opt.value}
              className={`${styles.option} ${value === opt.value ? styles.optionSelected : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
