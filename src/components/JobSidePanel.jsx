import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './JobSidePanel.module.css'

export default function JobSidePanel({ isOpen, onClose, jobId }) {
  const { t } = useTranslation()
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
        <button className={styles.closeBtn} onClick={onClose} aria-label={t('common:action.close')}>✕</button>
        <div className={styles.body}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{t('misc:jobPanel.title')}</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>Job side panel for {jobId} — wiring up Friday</p>
        </div>
      </div>
    </>
  )
}
