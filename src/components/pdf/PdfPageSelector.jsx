import styles from './PdfPageSelector.module.css'

// Renders a horizontal strip of page thumbnails for a multi-page PDF.
// Each card shows a small preview image (once rendered) and the page number.
// A green dot appears when the page has a saved scale.
//
// Props:
//   pageCount   — total number of pages
//   currentPage — the currently selected page number
//   thumbnails  — object map { [pageNum]: dataUrl } populated async
//   onPageSelect — (pageNum: number) => void
//   pageScales  — { [pageNum]: pixelsPerFoot } from session state
export default function PdfPageSelector({ pageCount, currentPage, thumbnails, onPageSelect, pageScales = {} }) {
  return (
    <div className={styles.strip}>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map(pageNum => {
        const hasScale = pageScales[pageNum] != null
        return (
          <button
            key={pageNum}
            className={`${styles.thumb} ${pageNum === currentPage ? styles.active : ''}`}
            onClick={() => onPageSelect(pageNum)}
            title={`Page ${pageNum}${hasScale ? ' (scale set)' : ''}`}
          >
            <div className={styles.preview}>
              {thumbnails[pageNum] ? (
                <img
                  src={thumbnails[pageNum]}
                  alt={`Page ${pageNum}`}
                  className={styles.thumbImg}
                />
              ) : (
                <div className={styles.thumbPlaceholder} />
              )}
              {hasScale && <span className={styles.savedDot} />}
            </div>
            <span className={styles.pageLabel}>{pageNum}</span>
          </button>
        )
      })}
    </div>
  )
}
