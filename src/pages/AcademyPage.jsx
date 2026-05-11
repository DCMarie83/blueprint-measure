import { useState } from 'react'
import { Bookmark, BookmarkCheck, GraduationCap } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { ACADEMY_VIDEOS, ACADEMY_CATEGORIES } from '../data/academyVideos'
import { useAcademyBookmarks } from '../hooks/useAcademyBookmarks'
import VideoModal from '../components/academy/VideoModal'
import styles from './AcademyPage.module.css'

export default function AcademyPage() {
  const { isBookmarked, toggle, count } = useAcademyBookmarks()
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false)
  const [openVideo, setOpenVideo] = useState(null)

  const filtered = ACADEMY_VIDEOS.filter(v =>
    (selectedCategory === 'All' || v.category === selectedCategory) &&
    (!showBookmarksOnly || isBookmarked(v.id))
  )

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>RivetDog Academy</h1>
          <p className={styles.subtitle}>Training videos to help you get the most out of RivetDog.</p>
        </div>

        {ACADEMY_VIDEOS.length > 0 && (
          <div className={styles.filterRow}>
            <div className={styles.chipGroup}>
              <button
                className={`${styles.chip} ${selectedCategory === 'All' ? styles.chipActive : ''}`}
                onClick={() => setSelectedCategory('All')}
              >All</button>
              {ACADEMY_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  className={`${styles.chip} ${selectedCategory === cat ? styles.chipActive : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >{cat}</button>
              ))}
            </div>
            <button
              className={`${styles.bookmarkFilter} ${showBookmarksOnly ? styles.bookmarkFilterActive : ''}`}
              onClick={() => setShowBookmarksOnly(v => !v)}
            >
              <Bookmark size={14} /> My Bookmarks {count > 0 && `(${count})`}
            </button>
          </div>
        )}

        {ACADEMY_VIDEOS.length === 0 ? (
          <div className={styles.emptyState}>
            <GraduationCap size={48} />
            <h2>Videos coming soon</h2>
            <p>Dee is in the studio. Check back soon for training content.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.filterEmpty}>
            <p>No videos in this category yet.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map(video => (
              <div key={video.id} className={styles.card} onClick={() => setOpenVideo(video)}>
                <div className={styles.thumbnail}>
                  <img
                    src={`https://img.youtube.com/vi/${video.youtubeId}/maxresdefault.jpg`}
                    alt={video.title}
                    onError={(e) => { e.target.src = `https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg` }}
                  />
                  <span className={styles.duration}>{video.duration}</span>
                  <button
                    className={styles.bookmarkBtn}
                    onClick={(e) => { e.stopPropagation(); toggle(video.id) }}
                    aria-label={isBookmarked(video.id) ? 'Remove bookmark' : 'Add bookmark'}
                  >
                    {isBookmarked(video.id)
                      ? <BookmarkCheck size={16} fill="currentColor" />
                      : <Bookmark size={16} />
                    }
                  </button>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{video.title}</h3>
                  <p className={styles.cardDesc}>{video.description}</p>
                  <span className={styles.categoryBadge}>{video.category}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {openVideo && (
        <VideoModal
          video={openVideo}
          onClose={() => setOpenVideo(null)}
          isBookmarked={isBookmarked(openVideo.id)}
          onToggleBookmark={() => toggle(openVideo.id)}
        />
      )}
    </div>
  )
}
