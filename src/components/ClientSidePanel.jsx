import { useEffect } from 'react'
import styles from './ClientSidePanel.module.css'

export default function ClientSidePanel({ isOpen, onClose, clientId }) {
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [isOpen, onClose])

  return (
    <>
      {isOpen && <div className={styles.backdrop} onClick={onClose} />}
      <div className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        <div className={styles.body}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Client Details</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>Client side panel for {clientId} — wiring up Friday</p>
        </div>
      </div>
    </>
  )
}
