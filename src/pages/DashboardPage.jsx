import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProjects } from '../hooks/useProjects'
import { useSessions } from '../hooks/useSessions'
import { getCompanyStorageUsage } from '../utils/storageUsage'
import { getStorageLimitMb } from '../lib/plans'
import Modal from '../components/ui/Modal'
import NewProjectForm from '../components/auth/NewProjectForm'
import NewSessionForm from '../components/auth/NewSessionForm'
import StorageBar from '../components/ui/StorageBar'
import UserMenu from '../components/UserMenu'
import { useDateFormat } from '../hooks/useDateFormat'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import styles from './DashboardPage.module.css'

const ADMIN_EMAIL = 'main@ngautomationhub.com'

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
  const { projects, loading: projectsLoading, createProject, softDeleteProject, refetch: refetchProjects } = useProjects()
  const { sessions, loading: sessionsLoading, createSession } = useSessions()
  const [showNewProject, setShowNewProject] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [companyPlan, setCompanyPlan] = useState(null)
  const [blueprintLimit, setBlueprintLimit] = useState(null)
  const [storageDisplay, setStorageDisplay] = useState(null)
  const [totalZones, setTotalZones] = useState(null)
  const [activity, setActivity] = useState([])
  const [activityOpen, setActivityOpen] = useState(true)
  const [jobSort, setJobSort] = useState('updated_desc')
  const navigate = useNavigate()

  const loading = projectsLoading || sessionsLoading
  const { formatDate, formatDateTime } = useDateFormat()

  // Fetch company plan, storage, zone counts, and activity
  useEffect(() => {
    if (!user || user.email === ADMIN_EMAIL) return

    async function loadDashboardData() {
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

      if (profile?.company_id) {
        try {
          const limitMb = getStorageLimitMb(plan)
          const usage = await getCompanyStorageUsage(profile.company_id)
          setStorageDisplay({
            usedGb: (usage.totalBytes / (1024 * 1024 * 1024)).toFixed(1),
            limitGb: limitMb != null ? (limitMb / 1024).toFixed(0) : null,
            usedBytes: usage.totalBytes,
            limitBytes: limitMb != null ? limitMb * 1024 * 1024 : null,
          })
        } catch { /* ignore */ }
      }

      const { count: zoneCount } = await supabase
        .from('zones')
        .select('id', { count: 'exact', head: true })
        .in('session_id', (await supabase.from('sessions').select('id').eq('user_id', user.id)).data?.map(s => s.id) ?? [])
      setTotalZones(zoneCount ?? 0)

      // Activity feed
      const activityItems = []
      const { data: recentSessions } = await supabase.from('sessions').select('id, project_name, created_at, blueprint_url').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
      recentSessions?.forEach(s => {
        activityItems.push({ type: 'session', text: `Created blueprint "${s.project_name}"`, time: s.created_at, sessionId: s.id })
        if (s.blueprint_url) {
          activityItems.push({ type: 'upload', text: `Uploaded file for "${s.project_name}"`, time: s.created_at, sessionId: s.id })
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

  async function handleCreateProject(fields) {
    const project = await createProject(fields)
    setShowNewProject(false)
    try {
      const session = await createSession({
        projectName: project.name,
        projectId: project.id,
        description: null,
      })
      navigate(`/session/${session.id}`)
    } catch {
      // Session creation failed — land on Job Overview so user can add blueprint manually
      navigate(`/project/${project.id}`)
    }
  }

  // Legacy flow: create session from dashboard (auto-creates project)
  async function handleCreateSession(fields) {
    const session = await createSession(fields)
    setShowNewSession(false)
    navigate(`/session/${session.id}`)
  }

  async function handleDeleteProject(projectId) {
    await softDeleteProject(projectId)
    setDeleteConfirm(null)
  }

  const ACTIVITY_ICONS = { session: '+', upload: 'U', zone: 'Z', scale: 'S', test: 'T' }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <Logo variant="mark" />
        </div>
        <div className={styles.userBar}>
          <span className={styles.email}>{user?.email}</span>
          {companyPlan === 'founders' && (
            <span className={styles.foundersBadge}>Founders</span>
          )}
          <UserMenu />
        </div>
      </header>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.empty}>Loading...</div>
        ) : (
          <>
            {/* Metrics */}
            <div className={styles.metrics}>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Active Jobs</div>
                <div className={styles.metricValue}>{projects.length}</div>
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
                {storageDisplay
                  ? <StorageBar usedBytes={storageDisplay.usedBytes} limitBytes={storageDisplay.limitBytes} />
                  : <div className={styles.metricValue}>—</div>
                }
              </div>
            </div>

            {/* Projects */}
            <section className={styles.dashSection}>
              <div className={styles.dashSectionHeader}>
                <h2 className={styles.dashSectionTitle}>Jobs</h2>
                {projects.length > 1 && (
                  <select
                    value={jobSort}
                    onChange={e => setJobSort(e.target.value)}
                    style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
                  >
                    <option value="updated_desc">Last activity (newest)</option>
                    <option value="updated_asc">Last activity (oldest)</option>
                    <option value="created_desc">Created (newest)</option>
                    <option value="created_asc">Created (oldest)</option>
                    <option value="name_asc">Name A→Z</option>
                    <option value="name_desc">Name Z→A</option>
                  </select>
                )}
              </div>
              {projects.length === 0 ? (
                <div className={styles.emptyState}>
                  <h2>No jobs yet</h2>
                  <p>Create your first job to upload blueprints and start measuring.</p>
                  <button className={styles.newBtn} onClick={() => setShowNewProject(true)}>
                    + New Job
                  </button>
                </div>
              ) : (
                <div className={styles.grid}>
                  {[...projects].sort((a, b) => {
                    switch (jobSort) {
                      case 'updated_asc': return new Date(a.last_activity) - new Date(b.last_activity)
                      case 'created_desc': return new Date(b.created_at) - new Date(a.created_at)
                      case 'created_asc': return new Date(a.created_at) - new Date(b.created_at)
                      case 'name_asc': return (a.name || '').localeCompare(b.name || '')
                      case 'name_desc': return (b.name || '').localeCompare(a.name || '')
                      default: return new Date(b.last_activity) - new Date(a.last_activity)
                    }
                  }).map(project => (
                    <div key={project.id} className={styles.card}>
                      <div className={styles.cardMain} onClick={() => {
                        if (project.session_count === 1 && project.first_session_id) {
                          navigate(`/session/${project.first_session_id}`)
                        } else {
                          navigate(`/project/${project.id}`)
                        }
                      }}>
                        <div className={styles.cardTitle}>{project.name}</div>
                        <div className={styles.cardClient} style={!project.client_name ? { visibility: 'hidden' } : undefined}>
                          {project.client_name || '\u00A0'}
                        </div>
                        <div className={styles.cardMeta}>
                          <span>{project.session_count} blueprint{project.session_count !== 1 ? 's' : ''}</span>
                          <span>{timeAgo(project.last_activity)}</span>
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        <button className={styles.openBtn} onClick={() => {
                          if (project.session_count === 1 && project.first_session_id) {
                            navigate(`/session/${project.first_session_id}`)
                          } else {
                            navigate(`/project/${project.id}`)
                          }
                        }}>
                          Open
                        </button>
                        <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(project.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Quick Actions */}
            <div className={styles.quickActions}>
              <button className={styles.quickBtn} onClick={() => setShowNewProject(true)}>
                + New Job
              </button>
            </div>

            {/* Recent Activity */}
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
          </>
        )}
      </main>

      {/* New Project modal */}
      {showNewProject && (
        <Modal title="New Job" onClose={() => setShowNewProject(false)}>
          <NewProjectForm
            onCreate={handleCreateProject}
            onCancel={() => setShowNewProject(false)}
          />
        </Modal>
      )}

      {/* Legacy: New Session modal (kept for backward compat) */}
      {showNewSession && (
        <Modal title="New Session" onClose={() => setShowNewSession(false)}>
          <NewSessionForm
            onCreate={handleCreateSession}
            onCancel={() => setShowNewSession(false)}
          />
        </Modal>
      )}

      {/* Delete project confirmation */}
      {deleteConfirm && (
        <Modal title="Delete Job?" onClose={() => setDeleteConfirm(null)}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
            This will archive the job and hide it from your dashboard. You can contact support to recover it if needed.
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
              onClick={() => handleDeleteProject(deleteConfirm)}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
