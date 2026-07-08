import { useState, useEffect, useCallback, useRef } from 'react'
import styles from './PdfPageManager.module.css'

// Modal for naming and hiding/unhiding PDF pages.
// page_metadata shape: { "1": { name: "First Floor", hidden: false }, ... }
// Auto-saves on every name blur/Enter and hide toggle — no explicit Save button needed.
export default function PdfPageManager({ pageCount, thumbnails, initialMetadata, renderPage, onAutoSave, onClose }) {
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
        name: existing?.name ?? `Page ${i}`,
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
          <h2 className={styles.title}>Manage Pages</h2>
          <p className={styles.subtitle}>Name your pages and hide any you don't need for this takeoff. Changes save automatically. Click a thumbnail to zoom in.</p>
        </div>

        <div className={styles.grid}>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map(pageNum => {
            const key = String(pageNum)
            const meta = metadata[key] ?? { name: `Page ${pageNum}`, hidden: false }
            const isHidden = meta.hidden

            return (
              <div key={pageNum} className={`${styles.card} ${isHidden ? styles.cardHidden : ''}`}>
                <div
                  className={`${styles.thumbWrap} ${thumbnails[pageNum] ? styles.thumbClickable : ''}`}
                  onClick={() => thumbnails[pageNum] && openLightbox(pageNum)}
                >
                  {thumbnails[pageNum] ? (
                    <img src={thumbnails[pageNum]} alt={`Page ${pageNum}`} className={styles.thumbImg} />
                  ) : (
                    <div className={styles.thumbPlaceholder}>
                      <span>{pageNum}</span>
                    </div>
                  )}
                  {isHidden && <div className={styles.hiddenBadge}>HIDDEN</div>}
                </div>
                <div className={styles.pageNumber}>Page {pageNum}</div>
                <input
                  className={styles.nameInput}
                  value={meta.name}
                  onChange={e => handleNameChange(pageNum, e.target.value)}
                  onBlur={handleNameBlur}
                  placeholder={`Page ${pageNum}`}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                />
                <button
                  className={isHidden ? styles.unhideBtn : styles.hideBtn}
                  onClick={() => handleToggleHidden(pageNum)}
                >
                  {isHidden ? 'Unhide page' : 'Hide page'}
                </button>
              </div>
            )
          })}
        </div>

        <div className={styles.footer}>
          {saved && <span style={{ fontSize: 12, color: 'var(--color-success, #22c55e)', fontWeight: 600 }}>Saved ✓</span>}
          <button className={styles.saveBtn} onClick={onClose}>Done</button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxPage !== null && (
        <div className={styles.lightboxBackdrop} onClick={closeLightbox}>
          <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
            <button className={styles.lightboxClose} onClick={closeLightbox} aria-label="Close preview">✕</button>
            {lightboxLoading ? (
              <div className={styles.lightboxLoading}>Loading page {lightboxPage}…</div>
            ) : lightboxImage ? (
              <img src={lightboxImage} alt={`Page ${lightboxPage}`} className={styles.lightboxImage} />
            ) : (
              <div className={styles.lightboxLoading}>Failed to load preview</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
