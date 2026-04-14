import styles from './PdfPageSelector.module.css'

// Renders a horizontal strip of page thumbnails for a multi-page PDF.
// Each card shows a small preview image (once rendered) and the page number.
// Clicking a card calls onPageSelect(pageNum).
//
// Props:
//   pageCount   — total number of pages
//   currentPage — the currently selected page number
//   thumbnails  — object map { [pageNum]: dataUrl } populated async
//   onPageSelect — (pageNum: number) => void
export default function PdfPageSelector({ pageCount, currentPage, thumbnails, onPageSelect }) {
  return (
    <div className={styles.strip}>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map(pageNum => (
        <button
          key={pageNum}
          className={`${styles.thumb} ${pageNum === currentPage ? styles.active : ''}`}
          onClick={() => onPageSelect(pageNum)}
          title={`Page ${pageNum}`}
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
          </div>
          <span className={styles.pageLabel}>{pageNum}</span>
        </button>
      ))}
    </div>
  )
}
