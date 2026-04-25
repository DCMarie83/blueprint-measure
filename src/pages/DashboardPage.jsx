import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSessions } from '../hooks/useSessions'
import { getCompanyStorageUsage } from '../utils/storageUsage'
import Modal from '../components/ui/Modal'
import NewSessionForm from '../components/auth/NewSessionForm'
import styles from './DashboardPage.module.css'

const ADMIN_EMAIL = 'main@ngautomationhub.com'
const PLAN_STORAGE = { basic: 5120, plus: 25600, ultra: 102400, founders: 25600, pilot: null }

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { sessions, loading, createSession, deleteSession } = useSessions()
  const [showNewSession, setShowNewSession] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [companyPlan, setCompanyPlan] = useState(null)
  const [blueprintLimit, setBlueprintLimit] = useState(null)
  const [storageDisplay, setStorageDisplay] = useState(null)
  const [zoneCounts, setZoneCounts] = useState({}) // { [sessionId]: number }
  const [totalZones, setTotalZones] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityOpen, setActivityOpen] = useState(true)
  const navigate = useNavigate()

  // Fetch company plan, storage, zone counts, and activity
  useEffect(() => {
    if (!user || user.email === ADMIN_EMAIL) return

    async function loadDashboardData() {
      // Split into two queries to avoid FK join into companies (RLS blocks the embed)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single()

      let plan = null
      let bpLimit = null
      if (profile?.company_id) {
        const { data: c } = await supabase
          .from('companies')
          .select('plan, blueprint_limit')
          .eq('id', profile.company_id)
          .single()
        plan = c?.plan ?? null
        bpLimit = c?.blueprint_limit ?? null
      }
      setCompanyPlan(plan)
      setBlueprintLimit(bpLimit)

      // Storage usage
      if (profile?.company_id) {
        try {
          const limitMb = PLAN_STORAGE[plan] ?? null
          const usage = await getCompanyStorageUsage(profile.company_id)
          setStorageDisplay({
            usedGb: (usage.totalBytes / (1024 * 1024 * 1024)).toFixed(1),
            limitGb: limitMb != null ? (limitMb / 1024).toFixed(0) : null,
          })
        } catch { /* ignore */ }
      }

      // Total zone count for this user
      const { count: zoneCount } = await supabase
        .from('zones')
        .select('id', { count: 'exact', head: true })
        .in('session_id', (await supabase.from('sessions').select('id').eq('user_id', user.id)).data?.map(s => s.id) ?? [])
      setTotalZones(zoneCount ?? 0)

      // Per-session zone counts (for recent 6)
      const { data: sessionIds } = await supabase.from('sessions').select('id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(6)
      if (sessionIds?.length) {
        const { data: zoneRows } = await supabase
          .from('zones')
          .select('session_id')
          .in('session_id', sessionIds.map(s => s.id))
        const counts = {}
        zoneRows?.forEach(z => { counts[z.session_id] = (counts[z.session_id] ?? 0) + 1 })
        setZoneCounts(counts)
      }

      // Activity feed — derive from sessions + zones
      const activityItems = []
      const { data: recentSessions } = await supabase.from('sessions').select('id, project_name, created_at, blueprint_url').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
      recentSessions?.forEach(s => {
        activityItems.push({ type: 'session', text: `Created session "${s.project_name}"`, time: s.created_at, sessionId: s.id })
        if (s.blueprint_url) {
          activityItems.push({ type: 'upload', text: `Uploaded blueprint for "${s.project_name}"`, time: s.created_at, sessionId: s.id })
        }
      })

      const allSessionIds = recentSessions?.map(s => s.id) ?? []
      if (allSessionIds.length) {
        const { data: recentZones } = await supabase.from('zones').select('name, created_at, session_id').in('session_id', allSessionIds).order('created_at', { ascending: false }).limit(20)
        recentZones?.forEach(z => {
          activityItems.push({ type: 'zone', text: `Measured ${z.name}`, time: z.created_at, sessionId: z.session_id })
        })
      }

      activityItems.sort((a, b) => new Date(b.time) - new Date(a.time))
      setActivity(activityItems.slice(0, 10))
    }

    loadDashboardData()
  }, [user])

  const now = new Date()
  const sessionsThisMonth = sessions.filter(s => {
    const d = new Date(s.created_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length

  const activeSessions = sessions.filter(s => (zoneCounts[s.id] ?? 0) > 0 || s.blueprint_url).length

  const recentSessions = sessions.slice(0, 6)

  async function handleCreate(fields) {
    const session = await createSession(fields)
    setShowNewSession(false)
    navigate(`/session/${session.id}`)
  }

  async function handleDelete(sessionId) {
    await deleteSession(sessionId)
    setDeleteConfirm(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const ACTIVITY_ICONS = { session: '+', upload: 'U', zone: 'Z', scale: 'S', test: 'T' }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="#2e8bff"/>
            <path d="M8 28V10h4v14h12V10h4v18H8z" fill="white" opacity="0.9"/>
            <path d="M14 10h8v8h-8z" fill="white"/>
          </svg>
          <span>BlueprintMeasure</span>
        </div>
        <div className={styles.userBar}>
          <span className={styles.email}>{user?.email}</span>
          {companyPlan === 'founders' && (
            <span className={styles.foundersBadge}>Founders</span>
          )}
          {storageDisplay && (
            <span className={styles.storageIndicator}>
              {storageDisplay.usedGb} GB{storageDisplay.limitGb ? ` of ${storageDisplay.limitGb} GB` : ''} used
            </span>
          )}
          <Link to="/account" className={styles.accountLink}>Account</Link>
          {user?.email === ADMIN_EMAIL && (
            <Link to="/admin" className={styles.adminLink}>Admin</Link>
          )}
          <button className={styles.logout} onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.empty}>Loading…</div>
        ) : (
          <>
            {/* ROW 1 — Metric Cards */}
            <div className={styles.metrics}>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Active Sessions</div>
                <div className={styles.metricValue}>{activeSessions}</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Blueprints This Month</div>
                <div className={styles.metricValue}>
                  {sessionsThisMonth}{blueprintLimit != null ? ` of ${blueprintLimit}` : ''}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Total Zones Measured</div>
                <div className={styles.metricValue}>{totalZones ?? '—'}</div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Storage Used</div>
                <div className={styles.metricValue}>
                  {storageDisplay
                    ? `${storageDisplay.usedGb} GB${storageDisplay.limitGb ? ` / ${storageDisplay.limitGb} GB` : ''}`
                    : '—'}
                </div>
              </div>
            </div>

            {/* ROW 2 — Recent Sessions */}
            <section className={styles.dashSection}>
              <div className={styles.dashSectionHeader}>
                <h2 className={styles.dashSectionTitle}>Recent Sessions</h2>
                {sessions.length > 6 && (
                  <button className={styles.viewAllBtn} onClick={() => {
                    document.getElementById('all-sessions')?.scrollIntoView({ behavior: 'smooth' })
                  }}>View All</button>
                )}
              </div>
              {sessions.length === 0 ? (
                <div className={styles.emptyState}>
                  <h2>No sessions yet</h2>
                  <p>Create your first session to upload a blueprint and start measuring.</p>
                  <button className={styles.newBtn} onClick={() => setShowNewSession(true)}>
                    + New Session
                  </button>
                </div>
              ) : (
                <div className={styles.grid}>
                  {recentSessions.map(session => (
                    <div key={session.id} className={styles.card} onClick={() => navigate(`/session/${session.id}`)}>
                      <div className={styles.cardMain}>
                        <div className={styles.cardTitle}>{session.project_name}</div>
                        <div className={styles.cardClient}>{session.client_name}</div>
                        <div className={styles.cardMeta}>
                          <span>{timeAgo(session.updated_at ?? session.created_at)}</span>
                          {zoneCounts[session.id] != null && (
                            <span>{zoneCounts[session.id]} zone{zoneCounts[session.id] !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ROW 3 — Quick Actions */}
            <div className={styles.quickActions}>
              <button className={styles.quickBtn} onClick={() => setShowNewSession(true)}>
                + New Session
              </button>
              {sessions.length > 0 && (
                <button className={styles.quickBtnSecondary} onClick={() => {
                  document.getElementById('all-sessions')?.scrollIntoView({ behavior: 'smooth' })
                }}>
                  View All Sessions
                </button>
              )}
            </div>

            {/* ROW 4 — Activity Feed */}
            {activity.length > 0 && (
              <section className={styles.dashSection}>
                <div className={styles.dashSectionHeader}>
                  <h2
                    className={styles.dashSectionTitle}
                    onClick={() => setActivityOpen(v => !v)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className={styles.chevron}>{activityOpen ? '▾' : '▸'}</span>
                    {' '}Recent Activity
                  </h2>
                </div>
                {activityOpen && (
                  <>
                    <div className={styles.activityList}>
                      {activity.slice(0, 5).map((item, i) => (
                        <div
                          key={i}
                          className={styles.activityItemClickable}
                          onClick={() => item.sessionId && navigate(`/session/${item.sessionId}`)}
                        >
                          <span className={styles.activityIcon}>{ACTIVITY_ICONS[item.type] ?? '·'}</span>
                          <span className={styles.activityText}>{item.text}</span>
                          <span className={styles.activityTime}>{timeAgo(item.time)}</span>
                        </div>
                      ))}
                    </div>
                    <Link to="/account" className={styles.viewAllActivityLink}>
                      View All Activity
                    </Link>
                  </>
                )}
              </section>
            )}

            {/* All Sessions (scroll target) */}
            {sessions.length > 6 && (
              <section className={styles.dashSection} id="all-sessions">
                <h2 className={styles.dashSectionTitle}>All Sessions ({sessions.length})</h2>
                <div className={styles.grid}>
                  {sessions.map(session => (
                    <div key={session.id} className={styles.card}>
                      <div className={styles.cardMain} onClick={() => navigate(`/session/${session.id}`)}>
                        <div className={styles.cardTitle}>{session.project_name}</div>
                        <div className={styles.cardClient}>{session.client_name}</div>
                        <div className={styles.cardDate}>
                          {new Date(session.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric'
                          })}
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        <button className={styles.openBtn} onClick={() => navigate(`/session/${session.id}`)}>
                          Open
                        </button>
                        <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(session.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {showNewSession && (
        <Modal title="New Session" onClose={() => setShowNewSession(false)}>
          <NewSessionForm
            onCreate={handleCreate}
            onCancel={() => setShowNewSession(false)}
          />
        </Modal>
      )}

      {deleteConfirm && (
        <Modal title="Delete Session?" onClose={() => setDeleteConfirm(null)}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
            This will permanently delete the session and all its measurements. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '9px 18px', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              onClick={() => setDeleteConfirm(null)}
            >
              Cancel
            </button>
            <button
              style={{ background: 'var(--color-danger)', border: 'none', borderRadius: 'var(--radius)', padding: '9px 18px', color: 'white', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => handleDelete(deleteConfirm)}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
