import styles from './PdfPageSelector.module.css'

// Renders a horizontal strip of page thumbnails for a multi-page PDF.
// Hidden pages (via page_metadata) are filtered out entirely.
// Shows zone count badge instead of the old green dot.
export default function PdfPageSelector({ pageCount, currentPage, thumbnails, onPageSelect, pageScales = {}, pageMetadata = {}, zones = [] }) {
  const visiblePages = []
  for (let i = 1; i <= pageCount; i++) {
    const meta = pageMetadata[String(i)]
    if (meta?.hidden) continue
    visiblePages.push(i)
  }

  return (
    <div className={styles.strip}>
      {visiblePages.map(pageNum => {
        const meta = pageMetadata[String(pageNum)]
        const displayName = meta?.name || `Page ${pageNum}`
        const zoneCount = zones.filter(z => (z.page_number ?? 1) === pageNum).length
        return (
          <button
            key={pageNum}
            className={`${styles.thumb} ${pageNum === currentPage ? styles.active : ''}`}
            onClick={() => onPageSelect(pageNum)}
            title={`${displayName}${zoneCount > 0 ? ` (${zoneCount} zones)` : ''}`}
          >
            <div className={styles.preview}>
              {thumbnails[pageNum] ? (
                <img src={thumbnails[pageNum]} alt={displayName} className={styles.thumbImg} />
              ) : (
                <div className={styles.thumbPlaceholder} />
              )}
              {zoneCount > 0 && (
                <span className={styles.zoneBadge}>
                  {zoneCount >= 100 ? '99+' : zoneCount}
                </span>
              )}
            </div>
            <span className={styles.pageLabel}>{displayName}</span>
          </button>
        )
      })}
    </div>
  )
}
