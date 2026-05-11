import { useEffect } from 'react'
import { X, Bookmark, BookmarkCheck } from 'lucide-react'
import styles from './VideoModal.module.css'

export default function VideoModal({ video, onClose, isBookmarked, onToggleBookmark }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  if (!video) return null

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <div className={styles.videoWrap}>
          <iframe
            src={`https://www.youtube.com/embed/${video.youtubeId}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            frameBorder="0"
            className={styles.iframe}
          />
        </div>

        <div className={styles.info}>
          <div className={styles.infoTop}>
            <h2 className={styles.title}>{video.title}</h2>
            <div className={styles.badges}>
              <span className={styles.categoryBadge}>{video.category}</span>
              <span className={styles.duration}>{video.duration}</span>
            </div>
          </div>
          <p className={styles.description}>{video.description}</p>
          <button className={styles.bookmarkBtn} onClick={onToggleBookmark}>
            {isBookmarked
              ? <><BookmarkCheck size={16} fill="currentColor" /> Bookmarked</>
              : <><Bookmark size={16} /> Bookmark</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
