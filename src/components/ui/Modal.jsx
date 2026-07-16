import { useEffect } from 'react'
import { useSheetSignal } from '../../hooks/useSheetSignal'
import styles from './Modal.module.css'

// A reusable modal dialog. Pass `onClose` to handle clicking the backdrop or X button.
export default function Modal({ title, onClose, children }) {
  // Only mounted while open, so signal the FAB to hide for its whole lifetime.
  useSheetSignal(true)

  // Close on Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
