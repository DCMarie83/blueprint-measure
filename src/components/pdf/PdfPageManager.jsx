import { useState, useEffect } from 'react'
import styles from './PdfPageManager.module.css'

// Modal for naming and hiding/unhiding PDF pages.
// page_metadata shape: { "1": { name: "First Floor", hidden: false }, ... }
export default function PdfPageManager({ pageCount, thumbnails, initialMetadata, onSave, onCancel }) {
  const [metadata, setMetadata] = useState({})

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

  function handleNameChange(pageNum, value) {
    setMetadata(prev => ({
      ...prev,
      [String(pageNum)]: { ...prev[String(pageNum)], name: value },
    }))
  }

  function handleToggleHidden(pageNum) {
    setMetadata(prev => ({
      ...prev,
      [String(pageNum)]: { ...prev[String(pageNum)], hidden: !prev[String(pageNum)]?.hidden },
    }))
  }

  function handleSave() {
    onSave(metadata)
  }

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Manage Pages</h2>
          <p className={styles.subtitle}>Name your pages and hide any you don't need for this takeoff.</p>
        </div>

        <div className={styles.grid}>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map(pageNum => {
            const key = String(pageNum)
            const meta = metadata[key] ?? { name: `Page ${pageNum}`, hidden: false }
            const isHidden = meta.hidden

            return (
              <div key={pageNum} className={`${styles.card} ${isHidden ? styles.cardHidden : ''}`}>
                <div className={styles.thumbWrap}>
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
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave}>Save & Continue</button>
        </div>
      </div>
    </div>
  )
}
