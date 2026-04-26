import { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'
import styles from './InfoTooltip.module.css'

export default function InfoTooltip({ children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      window.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <span className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={e => { e.preventDefault(); setOpen(v => !v) }}
        aria-label="More info"
      >
        <Info size={14} />
      </button>
      {open && (
        <div className={styles.popover}>
          {children}
        </div>
      )}
    </span>
  )
}
