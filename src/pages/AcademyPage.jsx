import { useState, useEffect, useCallback, useMemo } from 'react'
import { Bookmark, BookmarkCheck, GraduationCap, Search, MessageCircleQuestion, Send } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import { useIsLite } from '../hooks/useIsLite'
import {
  getAcademyModules, getAcademyVideos,
  getPublishedQuestions, getMyQuestions, submitQuestion,
} from '../data/academyVideos'
import { useAcademyBookmarks } from '../hooks/useAcademyBookmarks'
import { UNCATEGORIZED_KEY, UNCATEGORIZED_LABEL, isVisible } from '../lib/academyVisibility'
import { ONBOARDING_CALENDAR_URL } from '../lib/config'
import VideoModal from '../components/academy/VideoModal'
import styles from './AcademyPage.module.css'

const SECTION_ORDER = ['start_here', 'core', 'advanced']
const SECTION_LABELS = { start_here: 'Start Here', core: 'Core', advanced: 'Advanced' }

// Stable per-family audience sets (module-level so the load effect dep is a
// stable reference). Matched against each row's audiences[] via array-overlap.
const LITE_AUDIENCES = ['lite']
const FIELDOS_AUDIENCES = ['fieldos']

export default function AcademyPage() {
  const { user, company, isSuperAdmin, userProfile } = useAuth()
  const { companyId: effectiveCompanyId } = useEffectiveCompany()
  const { isLite, resolved } = useIsLite()
  const { isBookmarked, toggle, count } = useAcademyBookmarks()

  const [tab, setTab] = useState('lessons')
  const [modules, setModules] = useState([])
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
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

  const tradeVertical = company?.trade_vertical || 'all'
  const audiences = isLite ? LITE_AUDIENCES : FIELDOS_AUDIENCES
  const viewerFamily = isLite ? 'lite' : 'fieldos'
  // admin_only is a role lane. Lite subs are single-seat owners → always count as
  // admin (so admin_only never hides lite content). On the contractor path, admin =
  // super admin or contractor_admin; crew (contractor_user) are gated out.
  const viewerIsAdmin = isLite || isSuperAdmin || userProfile?.role === 'contractor_admin'

  // Load lessons — held until the plan family resolves so a Lite tenant never
  // fetches with the contractor audience set (or vice-versa) on first paint.
  useEffect(() => {
    if (!resolved) return
    let cancelled = false
    ;(async () => {
      setLoadError(null)
      try {
        const [mods, vids] = await Promise.all([
          getAcademyModules({ audiences }),
          getAcademyVideos({ tradeVertical, audiences }),
        ])
        if (!cancelled) { setModules(mods); setVideos(vids) }
      } catch (err) {
        // A query 400 (e.g. a dropped column) must LOOK like an error, not an
        // empty "coming soon" page — surface it into state for a visible banner.
        console.error('Academy load:', err)
        if (!cancelled) { setLoadError(err.message || 'Failed to load lessons.'); setModules([]); setVideos([]) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [tradeVertical, audiences, resolved])

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

  // Role gate (family match is already applied by the data-layer fetch; this layer
  // enforces the admin_only ROLE lane so crew never see RivetPay-admin content).
  // Shared isVisible() is the ONLY place the family-AND-role rule lives.
  const roleVisibleVideos = useMemo(
    () => videos.filter(v => isVisible({ audiences: v.audiences, admin_only: v.admin_only, viewerFamily, viewerIsAdmin })),
    [videos, viewerFamily, viewerIsAdmin],
  )
  const roleVisibleModules = useMemo(
    () => modules.filter(m => isVisible({ audiences: m.audiences, admin_only: m.admin_only, viewerFamily, viewerIsAdmin })),
    [modules, viewerFamily, viewerIsAdmin],
  )

  // Filter videos by search + bookmarks
  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return roleVisibleVideos.filter(v => {
      if (showBookmarksOnly && !isBookmarked(v.id)) return false
      if (q && !v.title.toLowerCase().includes(q) && !(v.description || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [roleVisibleVideos, searchQuery, showBookmarksOnly, isBookmarked])

  // Group modules into sections, with only modules that have visible videos
  const sections = useMemo(() => {
    const videosByModule = {}
    for (const v of filteredVideos) {
      const mid = v.module_id || UNCATEGORIZED_KEY
      if (!videosByModule[mid]) videosByModule[mid] = []
      videosByModule[mid].push(v)
    }

    const knownModuleIds = new Set(roleVisibleModules.map(m => m.id))
    const visibleModules = roleVisibleModules.filter(m => videosByModule[m.id]?.length > 0)

    const grouped = {}
    for (const m of visibleModules) {
      const g = m.module_group || 'core'
      if (!grouped[g]) grouped[g] = []
      grouped[g].push(m)
    }

    // Build ordered section list
    const allGroups = new Set([...SECTION_ORDER, ...Object.keys(grouped)])
    const result = []
    for (const g of allGroups) {
      if (!grouped[g]?.length) continue
      result.push({
        key: g,
        label: SECTION_LABELS[g] || g,
        featured: g === 'start_here',
        modules: grouped[g].map(m => ({ ...m, videos: videosByModule[m.id] || [] })),
      })
    }

    // Orphan rescue: any active, family-tagged video whose module is NOT visible to
    // this family (mis-tagged module) or has no module falls into "Uncategorized" —
    // it surfaces instead of vanishing. This is the fix for the Stage 8 silent-hide.
    const orphanVideos = []
    for (const [mid, vids] of Object.entries(videosByModule)) {
      if (mid === UNCATEGORIZED_KEY || !knownModuleIds.has(mid)) orphanVideos.push(...vids)
    }
    if (orphanVideos.length) {
      result.push({
        key: UNCATEGORIZED_KEY,
        label: UNCATEGORIZED_LABEL,
        featured: false,
        modules: [{ id: UNCATEGORIZED_KEY, title: '', description: null, videos: orphanVideos }],
      })
    }
    return result
  }, [filteredVideos, roleVisibleModules])

  // Upstream count of rows genuinely published for this viewer's family (computed via
  // the shared visibility rule so it can't drift from the data-layer fetch). If this
  // is non-zero but nothing renders, the emptiness is a client filter, not "no content".
  const familyPublishedCount = roleVisibleVideos.length

  // Q&A search
  const qaTerm = qaSearch.trim().toLowerCase()
  const filteredQs = qaTerm
    ? publishedQs.filter(qa => qa.question.toLowerCase().includes(qaTerm) || (qa.answer || '').toLowerCase().includes(qaTerm))
    : publishedQs

  async function handleAskSubmit(e) {
    e.preventDefault()
    if (!askText.trim() || !effectiveCompanyId) return
    setAskSubmitting(true)
    try {
      await submitQuestion({
        companyId: effectiveCompanyId,
        question: askText.trim(),
        videoId: askRelated || askVideoId || null,
        notifyMethod: askNotify,
      })
      setAskText(''); setAskRelated(''); setAskVideoId(null); setAskNotify('email')
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
    setAskVideoId(videoId); setAskRelated(videoId); setOpenVideo(null); setTab('qa')
    setTimeout(() => { document.getElementById('academy-ask-form')?.scrollIntoView({ behavior: 'smooth' }) }, 100)
  }

  function renderVideoCard(video) {
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
            {isBookmarked(video.id) ? <BookmarkCheck size={16} fill="currentColor" /> : <Bookmark size={16} />}
          </button>
        </div>
        <div className={styles.cardBody}>
          <h3 className={styles.cardTitle}>{video.title}</h3>
          <p className={styles.cardDesc}>{video.description}</p>
          {mod && <span className={styles.categoryBadge}>{mod.title}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>RivetDog Academy</h1>
          <p className={styles.subtitle}>Training videos and Q&A to help you get the most out of RivetDog.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 14 }}>
          <span style={{ color: 'var(--color-text-muted)' }}>New to RivetDog? Book your free 30-minute onboarding call.</span>
          <a
            href={ONBOARDING_CALENDAR_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#f27243', fontWeight: 600, textDecoration: 'underline', whiteSpace: 'nowrap' }}
          >
            Book now
          </a>
        </div>

        {/* Tabs */}
        <div className={styles.tabRow}>
          <button className={`${styles.tab} ${tab === 'lessons' ? styles.tabActive : ''}`} onClick={() => setTab('lessons')}>Lessons</button>
          <button className={`${styles.tab} ${tab === 'qa' ? styles.tabActive : ''}`} onClick={() => setTab('qa')}><MessageCircleQuestion size={14} /> Q&A</button>
        </div>

        {/* ── Lessons tab ─────────────────────────────────────────────── */}
        {tab === 'lessons' && (
          <>
            {!loading && videos.length > 0 && (
              <div className={styles.filterRow}>
                <div className={styles.searchWrap}>
                  <Search size={14} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search lessons…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  className={`${styles.bookmarkFilter} ${showBookmarksOnly ? styles.bookmarkFilterActive : ''}`}
                  onClick={() => setShowBookmarksOnly(v => !v)}
                >
                  <Bookmark size={14} /> My Bookmarks {count > 0 && `(${count})`}
                </button>
              </div>
            )}

            {loadError ? (
              <div className={styles.emptyState}>
                <GraduationCap size={48} />
                <h2>Couldn't load lessons</h2>
                <p>Something went wrong fetching training content. Please refresh — if it keeps happening, let us know.</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{loadError}</p>
              </div>
            ) : loading ? (
              <div className={styles.emptyState}><div className="spinner" /></div>
            ) : videos.length === 0 ? (
              <div className={styles.emptyState}>
                <GraduationCap size={48} />
                <h2>Videos coming soon</h2>
                <p>Dee is in the studio. Check back soon for training content.</p>
              </div>
            ) : sections.length === 0 ? (
              // Rows ARE published for this plan — the blank is a client-side filter,
              // never missing content. Say so, and name the active gates in the console.
              (() => {
                console.warn('[Academy] rendered empty with', familyPublishedCount, 'family-published videos. Active gates:',
                  { search: searchQuery.trim() || null, bookmarksOnly: showBookmarksOnly })
                return (
                  <div className={styles.filterEmpty}>
                    <p>{familyPublishedCount} {familyPublishedCount === 1 ? 'lesson is' : 'lessons are'} published for your plan but hidden by your current {showBookmarksOnly ? 'bookmark and search filters' : 'search'}.</p>
                  </div>
                )
              })()
            ) : (
              sections.map(section => (
                <div key={section.key} className={section.featured ? styles.featuredSection : styles.normalSection}>
                  <h2 className={section.featured ? styles.featuredHeading : styles.sectionHeading}>{section.label}</h2>
                  {section.modules.map(mod => (
                    <div key={mod.id} className={styles.moduleBlock}>
                      {mod.title && (
                        <h3 className={styles.moduleHeading}>
                          {mod.title}
                        </h3>
                      )}
                      {mod.description && <p className={styles.moduleDesc}>{mod.description}</p>}
                      <div className={styles.grid}>
                        {mod.videos.map(v => renderVideoCard(v))}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </>
        )}

        {/* ── Q&A tab ─────────────────────────────────────────────────── */}
        {tab === 'qa' && (
          <div className={styles.qaContainer}>
            <div id="academy-ask-form" className={styles.askCard}>
              <h3 className={styles.askTitle}>Ask a question</h3>
              <form onSubmit={handleAskSubmit}>
                <textarea className={styles.askTextarea} placeholder="What would you like to know?" value={askText} onChange={e => setAskText(e.target.value)} rows={3} required />
                <div className={styles.askRow}>
                  <select className={styles.askSelect} value={askRelated} onChange={e => setAskRelated(e.target.value)}>
                    <option value="">Related lesson (optional)</option>
                    {videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                  </select>
                  <select className={styles.askSelect} value={askNotify} onChange={e => setAskNotify(e.target.value)}>
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

            {myQs.length > 0 && (
              <div className={styles.myQsSection}>
                <h3 className={styles.sectionTitle}>My Questions</h3>
                {myQs.map(qa => (
                  <div key={qa.id} className={styles.qaItem}>
                    <p className={styles.qaQuestion}>{qa.question}</p>
                    {qa.answer ? (
                      <div className={styles.qaAnswer}><span className={styles.qaBadgeAnswered}>Answered</span><p>{qa.answer}</p></div>
                    ) : <span className={styles.qaBadgePending}>Pending</span>}
                  </div>
                ))}
              </div>
            )}

            <div className={styles.publicQaSection}>
              <h3 className={styles.sectionTitle}>Community Q&A</h3>
              <div className={styles.qaSearchWrap}>
                <Search size={14} />
                <input type="text" className={styles.qaSearchInput} placeholder="Search questions…" value={qaSearch} onChange={e => setQaSearch(e.target.value)} />
              </div>
              {qaLoading ? (
                <div className={styles.emptyState}><div className="spinner" /></div>
              ) : filteredQs.length === 0 ? (
                <p className={styles.qaEmpty}>{publishedQs.length === 0 ? 'No published questions yet. Be the first to ask!' : 'No matches.'}</p>
              ) : (
                filteredQs.map(qa => (
                  <div key={qa.id} className={styles.qaItem}>
                    <p className={styles.qaQuestion}>{qa.question}</p>
                    <div className={styles.qaAnswer}>
                      <p>{qa.answer}</p>
                      {qa.answered_at && <span className={styles.qaDate}>{new Date(qa.answered_at).toLocaleDateString()}</span>}
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
