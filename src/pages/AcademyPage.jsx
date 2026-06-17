import { useState, useEffect, useCallback } from 'react'
import { Bookmark, BookmarkCheck, GraduationCap, Search, MessageCircleQuestion, Send } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import {
  getAcademyModules, getAcademyVideos,
  getPublishedQuestions, getMyQuestions, submitQuestion,
} from '../data/academyVideos'
import { useAcademyBookmarks } from '../hooks/useAcademyBookmarks'
import VideoModal from '../components/academy/VideoModal'
import styles from './AcademyPage.module.css'

export default function AcademyPage() {
  const { user, userProfile, company, isSuperAdmin } = useAuth()
  const { isBookmarked, toggle, count } = useAcademyBookmarks()

  const [tab, setTab] = useState('lessons')
  const [modules, setModules] = useState([])
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  const [selectedModule, setSelectedModule] = useState('All')
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false)
  const [openVideo, setOpenVideo] = useState(null)
  const [askVideoId, setAskVideoId] = useState(null)

  // Q&A state
  const [publishedQs, setPublishedQs] = useState([])
  const [myQs, setMyQs] = useState([])
  const [qaLoading, setQaLoading] = useState(false)
  const [qaSearch, setQaSearch] = useState('')
  const [askText, setAskText] = useState('')
  const [askRelated, setAskRelated] = useState('')
  const [askNotify, setAskNotify] = useState('email')
  const [askSubmitting, setAskSubmitting] = useState(false)
  const [askSuccess, setAskSuccess] = useState(false)

  const isAdmin = isSuperAdmin || userProfile?.role === 'contractor_admin'
  const tradeVertical = company?.trade_vertical || 'all'

  // Load lessons
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [mods, vids] = await Promise.all([
          getAcademyModules(),
          getAcademyVideos({ tradeVertical, isAdmin }),
        ])
        if (!cancelled) { setModules(mods); setVideos(vids) }
      } catch (err) {
        console.error('Academy load:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [tradeVertical, isAdmin])

  // Load Q&A when tab changes
  const loadQA = useCallback(async () => {
    if (!user) return
    setQaLoading(true)
    try {
      const [pub, mine] = await Promise.all([
        getPublishedQuestions(),
        getMyQuestions(user.id),
      ])
      setPublishedQs(pub)
      setMyQs(mine)
    } catch (err) {
      console.error('Q&A load:', err)
    } finally {
      setQaLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (tab === 'qa') loadQA()
  }, [tab, loadQA])

  // Filtered videos
  const filtered = videos.filter(v =>
    (selectedModule === 'All' || v.module_id === selectedModule) &&
    (!showBookmarksOnly || isBookmarked(v.id))
  )

  // Q&A search
  const q = qaSearch.trim().toLowerCase()
  const filteredQs = q
    ? publishedQs.filter(qa => qa.question.toLowerCase().includes(q) || (qa.answer || '').toLowerCase().includes(q))
    : publishedQs

  async function handleAskSubmit(e) {
    e.preventDefault()
    if (!askText.trim() || !userProfile?.company_id) return
    setAskSubmitting(true)
    try {
      await submitQuestion({
        companyId: userProfile.company_id,
        question: askText.trim(),
        videoId: askRelated || askVideoId || null,
        notifyMethod: askNotify,
      })
      setAskText('')
      setAskRelated('')
      setAskVideoId(null)
      setAskNotify('email')
      setAskSuccess(true)
      setTimeout(() => setAskSuccess(false), 3000)
      loadQA()
    } catch (err) {
      alert('Failed to submit: ' + err.message)
    } finally {
      setAskSubmitting(false)
    }
  }

  function handleAskFromVideo(videoId) {
    setAskVideoId(videoId)
    setAskRelated(videoId)
    setOpenVideo(null)
    setTab('qa')
    setTimeout(() => {
      document.getElementById('academy-ask-form')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>RivetDog Academy</h1>
          <p className={styles.subtitle}>Training videos and Q&A to help you get the most out of RivetDog.</p>
        </div>

        {/* Tabs */}
        <div className={styles.tabRow}>
          <button className={`${styles.tab} ${tab === 'lessons' ? styles.tabActive : ''}`} onClick={() => setTab('lessons')}>
            Lessons
          </button>
          <button className={`${styles.tab} ${tab === 'qa' ? styles.tabActive : ''}`} onClick={() => setTab('qa')}>
            <MessageCircleQuestion size={14} /> Q&A
          </button>
        </div>

        {/* ── Lessons tab ─────────────────────────────────────────────── */}
        {tab === 'lessons' && (
          <>
            {!loading && videos.length > 0 && (
              <div className={styles.filterRow}>
                <div className={styles.chipGroup}>
                  <button
                    className={`${styles.chip} ${selectedModule === 'All' ? styles.chipActive : ''}`}
                    onClick={() => setSelectedModule('All')}
                  >All</button>
                  {modules.map(mod => (
                    <button
                      key={mod.id}
                      className={`${styles.chip} ${selectedModule === mod.id ? styles.chipActive : ''}`}
                      onClick={() => setSelectedModule(mod.id)}
                    >{mod.title}</button>
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

            {loading ? (
              <div className={styles.emptyState}><div className="spinner" /></div>
            ) : videos.length === 0 ? (
              <div className={styles.emptyState}>
                <GraduationCap size={48} />
                <h2>Videos coming soon</h2>
                <p>Dee is in the studio. Check back soon for training content.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.filterEmpty}>
                <p>No tricks here yet — check back soon.</p>
              </div>
            ) : (
              <div className={styles.grid}>
                {filtered.map(video => {
                  const mod = modules.find(m => m.id === video.module_id)
                  return (
                    <div key={video.id} className={styles.card} onClick={() => setOpenVideo(video)}>
                      <div className={styles.thumbnail}>
                        <img
                          src={`https://img.youtube.com/vi/${video.youtube_id}/maxresdefault.jpg`}
                          alt={video.title}
                          onError={(e) => { e.target.src = `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg` }}
                        />
                        {video.duration && <span className={styles.duration}>{video.duration}</span>}
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
                        {mod && <span className={styles.categoryBadge}>{mod.title}</span>}
                        {video.audience === 'admin' && <span className={styles.adminBadge}>Admin</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── Q&A tab ─────────────────────────────────────────────────── */}
        {tab === 'qa' && (
          <div className={styles.qaContainer}>
            {/* Ask form */}
            <div id="academy-ask-form" className={styles.askCard}>
              <h3 className={styles.askTitle}>Ask a question</h3>
              <form onSubmit={handleAskSubmit}>
                <textarea
                  className={styles.askTextarea}
                  placeholder="What would you like to know?"
                  value={askText}
                  onChange={e => setAskText(e.target.value)}
                  rows={3}
                  required
                />
                <div className={styles.askRow}>
                  <select
                    className={styles.askSelect}
                    value={askRelated}
                    onChange={e => setAskRelated(e.target.value)}
                  >
                    <option value="">Related lesson (optional)</option>
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  <select
                    className={styles.askSelect}
                    value={askNotify}
                    onChange={e => setAskNotify(e.target.value)}
                  >
                    <option value="email">Email me the answer</option>
                    <option value="in_app">Just show it in the app</option>
                  </select>
                  <button type="submit" className={styles.askBtn} disabled={!askText.trim() || askSubmitting}>
                    <Send size={14} /> {askSubmitting ? 'Sending…' : 'Submit'}
                  </button>
                </div>
                {askSuccess && <p className={styles.askConfirm}>Question submitted! We'll get back to you soon.</p>}
              </form>
            </div>

            {/* My Questions */}
            {myQs.length > 0 && (
              <div className={styles.myQsSection}>
                <h3 className={styles.sectionTitle}>My Questions</h3>
                {myQs.map(qa => (
                  <div key={qa.id} className={styles.qaItem}>
                    <p className={styles.qaQuestion}>{qa.question}</p>
                    {qa.answer ? (
                      <div className={styles.qaAnswer}>
                        <span className={styles.qaBadgeAnswered}>Answered</span>
                        <p>{qa.answer}</p>
                      </div>
                    ) : (
                      <span className={styles.qaBadgePending}>Pending</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Public Q&A */}
            <div className={styles.publicQaSection}>
              <h3 className={styles.sectionTitle}>Community Q&A</h3>
              <div className={styles.qaSearchWrap}>
                <Search size={14} />
                <input
                  type="text"
                  className={styles.qaSearchInput}
                  placeholder="Search questions…"
                  value={qaSearch}
                  onChange={e => setQaSearch(e.target.value)}
                />
              </div>
              {qaLoading ? (
                <div className={styles.emptyState}><div className="spinner" /></div>
              ) : filteredQs.length === 0 ? (
                <p className={styles.qaEmpty}>
                  {publishedQs.length === 0 ? 'No published questions yet. Be the first to ask!' : 'No matches.'}
                </p>
              ) : (
                filteredQs.map(qa => (
                  <div key={qa.id} className={styles.qaItem}>
                    <p className={styles.qaQuestion}>{qa.question}</p>
                    <div className={styles.qaAnswer}>
                      <p>{qa.answer}</p>
                      {qa.answered_at && (
                        <span className={styles.qaDate}>{new Date(qa.answered_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {openVideo && (
        <VideoModal
          video={{ ...openVideo, youtubeId: openVideo.youtube_id }}
          onClose={() => setOpenVideo(null)}
          isBookmarked={isBookmarked(openVideo.id)}
          onToggleBookmark={() => toggle(openVideo.id)}
          onAskQuestion={() => handleAskFromVideo(openVideo.id)}
        />
      )}
    </div>
  )
}
