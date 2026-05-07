import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProject } from '../hooks/useProject'
import { useSessions } from '../hooks/useSessions'
import Modal from '../components/ui/Modal'
import NewSessionForm from '../components/auth/NewSessionForm'
import UserMenu from '../components/UserMenu'
import styles from './DashboardPage.module.css'

function timeAgo(dateStr) {
  if (!dateStr) return ''
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

export default function ProjectDetailPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { project, sessions, loading, error, refetch } = useProject(projectId)
  const { createSession, deleteSession } = useSessions()

  const [showAddBlueprint, setShowAddBlueprint] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  async function handleCreateSession(fields) {
    const session = await createSession({ ...fields, projectId })
    setShowAddBlueprint(false)
    refetch()
    navigate(`/session/${session.id}`)
  }

  async function handleDeleteSession(sessionId) {
    await deleteSession(sessionId)
    setDeleteConfirm(null)
    refetch()
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.empty} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div className="spinner" />
        </div>
      </div>
    )
  }

  if (error || !project) {
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
          <UserMenu />
        </header>
        <main className={styles.main}>
          <p className={styles.empty}>Project not found.</p>
          <Link to="/dashboard" style={{ color: 'var(--color-primary)', fontSize: 14 }}>← Back to Dashboard</Link>
        </main>
      </div>
    )
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
        <UserMenu />
      </header>

      <main className={styles.main}>
        {/* Back link + project header */}
        <div style={{ marginBottom: 24 }}>
          <Link to="/dashboard" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}>← Dashboard</Link>
        </div>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>{project.name}</h1>
          {project.client_name && (
            <div style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 2 }}>{project.client_name}</div>
          )}
          {project.address && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', opacity: 0.7 }}>{project.address}</div>
          )}
        </div>

        {/* Blueprints section */}
        <section className={styles.dashSection}>
          <div className={styles.dashSectionHeader}>
            <h2 className={styles.dashSectionTitle}>Blueprints ({sessions.length})</h2>
            <button className={styles.quickBtn} style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => setShowAddBlueprint(true)}>
              + Add Blueprint
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className={styles.emptyState}>
              <h2>No blueprints yet</h2>
              <p>Add your first blueprint to start measuring.</p>
              <button className={styles.newBtn} onClick={() => setShowAddBlueprint(true)}>
                + Add Blueprint
              </button>
            </div>
          ) : (
            <div className={styles.grid}>
              {sessions.map(session => (
                <div key={session.id} className={styles.card}>
                  <div className={styles.cardMain} onClick={() => navigate(`/session/${session.id}`)}>
                    <div className={styles.cardTitle}>{session.project_name}</div>
                    <div className={styles.cardMeta}>
                      <span>{timeAgo(session.updated_at ?? session.created_at)}</span>
                      {session.blueprint_url && <span>Blueprint uploaded</span>}
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
          )}
        </section>
      </main>

      {/* Add Blueprint modal */}
      {showAddBlueprint && (
        <Modal title="Add Blueprint" onClose={() => setShowAddBlueprint(false)}>
          <NewSessionForm
            projectId={projectId}
            onCreate={handleCreateSession}
            onCancel={() => setShowAddBlueprint(false)}
          />
        </Modal>
      )}

      {/* Delete session confirmation */}
      {deleteConfirm && (
        <Modal title="Delete Blueprint?" onClose={() => setDeleteConfirm(null)}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
            This will permanently delete this blueprint and all its zones and measurements. This cannot be undone.
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
              onClick={() => handleDeleteSession(deleteConfirm)}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
