import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSessions } from '../hooks/useSessions'
import Modal from '../components/ui/Modal'
import NewSessionForm from '../components/auth/NewSessionForm'
import styles from './DashboardPage.module.css'

// The dashboard shows all past sessions and lets the user create new ones.
export default function DashboardPage() {
  const { user } = useAuth()
  const { sessions, loading, createSession, deleteSession } = useSessions()
  const [showNewSession, setShowNewSession] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // session id to confirm delete
  const navigate = useNavigate()

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
