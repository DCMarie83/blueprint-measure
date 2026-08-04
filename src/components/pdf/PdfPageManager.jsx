import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './PdfPageManager.module.css'

// Modal for naming and hiding/unhiding PDF pages.
// page_metadata shape: { "1": { name: "First Floor", hidden: false }, ... }
// Auto-saves on every name blur/Enter and hide toggle — no explicit Save button needed.
export default function PdfPageManager({ pageCount, thumbnails, initialMetadata, renderPage, onAutoSave, onClose }) {
  const { t } = useTranslation()
  const [metadata, setMetadata] = useState({})
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef(null)

  // Lightbox state
  const [lightboxPage, setLightboxPage] = useState(null)
  const [lightboxImage, setLightboxImage] = useState(null)
  const [lightboxLoading, setLightboxLoading] = useState(false)

  useEffect(() => {
    // Initialize metadata for all pages, merging with any existing saved metadata
    const init = {}
    for (let i = 1; i <= pageCount; i++) {
      const key = String(i)
      const existing = initialMetadata?.[key]
      init[key] = {
        name: existing?.name ?? t('blueprint:pdf.pageName', { num: i }),
        hidden: existing?.hidden ?? false,
      }
    }
    setMetadata(init)
  }, [pageCount, initialMetadata])

  function showSavedIndicator() {
    setSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 1500)
  }

  function persistMetadata(updated) {
    setMetadata(updated)
    onAutoSave(updated)
    showSavedIndicator()
  }

  function handleNameChange(pageNum, value) {
    setMetadata(prev => ({
      ...prev,
      [String(pageNum)]: { ...prev[String(pageNum)], name: value },
    }))
  }

  function handleNameBlur() {
    // Persist the current metadata state on blur (covers both blur and Enter→blur)
    persistMetadata(metadata)
  }

  function handleToggleHidden(pageNum) {
    const updated = {
      ...metadata,
      [String(pageNum)]: { ...metadata[String(pageNum)], hidden: !metadata[String(pageNum)]?.hidden },
    }
    persistMetadata(updated)
  }

  // Lightbox handlers
  const openLightbox = useCallback(async (pageNum) => {
    if (!renderPage) return
    setLightboxPage(pageNum)
    setLightboxImage(null)
    setLightboxLoading(true)
    const url = await renderPage(pageNum, 1.5)
    setLightboxImage(url)
    setLightboxLoading(false)
  }, [renderPage])

  function closeLightbox() {
    setLightboxPage(null)
    setLightboxImage(null)
    setLightboxLoading(false)
  }

  // Escape closes lightbox (not the parent modal)
  useEffect(() => {
    if (lightboxPage === null) return
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeLightbox()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [lightboxPage])

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(savedTimer.current), [])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('blueprint:pageManager.title')}</h2>
          <p className={styles.subtitle}>{t('blueprint:pageManager.subtitle')}</p>
        </div>

        <div className={styles.grid}>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map(pageNum => {
            const key = String(pageNum)
            const meta = metadata[key] ?? { name: t('blueprint:pdf.pageName', { num: pageNum }), hidden: false }
            const isHidden = meta.hidden

            return (
              <div key={pageNum} className={`${styles.card} ${isHidden ? styles.cardHidden : ''}`}>
                <div
                  className={`${styles.thumbWrap} ${thumbnails[pageNum] ? styles.thumbClickable : ''}`}
                  onClick={() => thumbnails[pageNum] && openLightbox(pageNum)}
                >
                  {thumbnails[pageNum] ? (
                    <img src={thumbnails[pageNum]} alt={t('blueprint:pdf.pageName', { num: pageNum })} className={styles.thumbImg} />
                  ) : (
                    <div className={styles.thumbPlaceholder}>
                      <span>{pageNum}</span>
                    </div>
                  )}
                  {isHidden && <div className={styles.hiddenBadge}>{t('blueprint:pageManager.hiddenBadge')}</div>}
                </div>
                <div className={styles.pageNumber}>{t('blueprint:pdf.pageName', { num: pageNum })}</div>
                <input
                  className={styles.nameInput}
                  value={meta.name}
                  onChange={e => handleNameChange(pageNum, e.target.value)}
                  onBlur={handleNameBlur}
                  placeholder={t('blueprint:pdf.pageName', { num: pageNum })}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                />
                <button
                  className={isHidden ? styles.unhideBtn : styles.hideBtn}
                  onClick={() => handleToggleHidden(pageNum)}
                >
                  {isHidden ? t('blueprint:pageManager.unhidePage') : t('blueprint:pageManager.hidePage')}
                </button>
              </div>
            )
          })}
        </div>

        <div className={styles.footer}>
          {saved && <span style={{ fontSize: 12, color: 'var(--color-success, #22c55e)', fontWeight: 600 }}>{t('blueprint:pageManager.saved')}</span>}
          <button className={styles.saveBtn} onClick={onClose}>{t('blueprint:pageManager.done')}</button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxPage !== null && (
        <div className={styles.lightboxBackdrop} onClick={closeLightbox}>
          <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
            <button className={styles.lightboxClose} onClick={closeLightbox} aria-label={t('blueprint:pageManager.closePreview')}>✕</button>
            {lightboxLoading ? (
              <div className={styles.lightboxLoading}>{t('blueprint:pageManager.loadingPage', { num: lightboxPage })}</div>
            ) : lightboxImage ? (
              <img src={lightboxImage} alt={t('blueprint:pdf.pageName', { num: lightboxPage })} className={styles.lightboxImage} />
            ) : (
              <div className={styles.lightboxLoading}>{t('blueprint:pageManager.failedPreview')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
