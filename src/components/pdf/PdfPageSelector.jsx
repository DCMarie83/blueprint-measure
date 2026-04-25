import styles from './PdfPageSelector.module.css'

// Renders a horizontal strip of page thumbnails for a multi-page PDF.
// Hidden pages (via page_metadata) are filtered out entirely.
// Custom page names from page_metadata are displayed instead of "Page N".
//
// Props:
//   pageCount    — total number of pages
//   currentPage  — the currently selected page number
//   thumbnails   — object map { [pageNum]: dataUrl } populated async
//   onPageSelect — (pageNum: number) => void
//   pageScales   — { [pageNum]: pixelsPerFoot } from session state
//   pageMetadata — { [pageNum]: { name, hidden } } from session state
export default function PdfPageSelector({ pageCount, currentPage, thumbnails, onPageSelect, pageScales = {}, pageMetadata = {} }) {
  // Build list of visible pages
  const visiblePages = []
  for (let i = 1; i <= pageCount; i++) {
    const meta = pageMetadata[String(i)]
    if (meta?.hidden) continue
    visiblePages.push(i)
  }

  return (
    <div className={styles.strip}>
      {visiblePages.map(pageNum => {
        const hasScale = pageScales[pageNum] != null
        const meta = pageMetadata[String(pageNum)]
        const displayName = meta?.name || `Page ${pageNum}`
        return (
          <button
            key={pageNum}
            className={`${styles.thumb} ${pageNum === currentPage ? styles.active : ''}`}
            onClick={() => onPageSelect(pageNum)}
            title={`${displayName}${hasScale ? ' (scale set)' : ''}`}
          >
            <div className={styles.preview}>
              {thumbnails[pageNum] ? (
                <img
                  src={thumbnails[pageNum]}
                  alt={displayName}
                  className={styles.thumbImg}
                />
              ) : (
                <div className={styles.thumbPlaceholder} />
              )}
              {hasScale && <span className={styles.savedDot} />}
            </div>
            <span className={styles.pageLabel}>{displayName}</span>
          </button>
        )
      })}
    </div>
  )
}
