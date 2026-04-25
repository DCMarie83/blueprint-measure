import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSessions } from '../hooks/useSessions'
import { getCompanyStorageUsage } from '../utils/storageUsage'
import Modal from '../components/ui/Modal'
import NewSessionForm from '../components/auth/NewSessionForm'
import styles from './DashboardPage.module.css'

// The dashboard shows all past sessions and lets the user create new ones.
export default function DashboardPage() {
  const { user } = useAuth()
  const { sessions, loading, createSession, deleteSession } = useSessions()
  const [showNewSession, setShowNewSession] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // session id to confirm delete
  const [companyPlan, setCompanyPlan] = useState(null)
  const navigate = useNavigate()

  const [storageDisplay, setStorageDisplay] = useState(null) // { usedGb, limitGb } or null

  // Fetch the user's company plan to show the Founders badge and storage usage.
  // Skipped for the super admin who has no company assignment.
  useEffect(() => {
    if (!user || user.email === 'main@ngautomationhub.com') return
    supabase
      .from('user_profiles')
      .select('company_id, companies(plan, features)')
      .eq('user_id', user.id)
      .single()
      .then(async ({ data }) => {
        const plan = data?.companies?.plan ?? null
        setCompanyPlan(plan)
        // Fetch storage usage for the company
        if (data?.company_id) {
          try {
            const PLAN_STORAGE = { basic: 5120, plus: 25600, ultra: 102400, founders: 25600, pilot: null }
            const limitMb = PLAN_STORAGE[plan] ?? null
            const usage = await getCompanyStorageUsage(data.company_id)
            setStorageDisplay({
              usedGb: (usage.totalBytes / (1024 * 1024 * 1024)).toFixed(1),
              limitGb: limitMb != null ? (limitMb / 1024).toFixed(0) : null,
            })
          } catch {
            // ignore storage fetch errors
          }
        }
      })
  }, [user])

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
          {user?.email === 'main@ngautomationhub.com' && (
            <Link to="/admin" className={styles.adminLink}>Admin</Link>
          )}
          <button className={styles.logout} onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.topRow}>
          <div>
            <h1 className={styles.heading}>Sessions</h1>
            <p className={styles.sub}>Each session is one blueprint upload with its measurements.</p>
          </div>
          <button className={styles.newBtn} onClick={() => setShowNewSession(true)}>
            + New Session
          </button>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📐</div>
            <h2>No sessions yet</h2>
            <p>Create your first session to upload a blueprint and start measuring.</p>
            <button className={styles.newBtn} onClick={() => setShowNewSession(true)}>
              + New Session
            </button>
          </div>
        ) : (
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
                  <button
                    className={styles.openBtn}
                    onClick={() => navigate(`/session/${session.id}`)}
                  >
                    Open
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => setDeleteConfirm(session.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
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
