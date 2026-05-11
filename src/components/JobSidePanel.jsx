import { useEffect } from 'react'
import styles from './JobSidePanel.module.css'

export default function JobSidePanel({ isOpen, onClose, jobId }) {
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
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Job Details</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>Job side panel for {jobId} — wiring up Friday</p>
        </div>
      </div>
    </>
  )
}
