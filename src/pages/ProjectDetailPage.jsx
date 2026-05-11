import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProject } from '../hooks/useProject'
import { useProjects } from '../hooks/useProjects'
import { useSessions } from '../hooks/useSessions'
import { getStorageLimitMb } from '../lib/plans'
import Modal from '../components/ui/Modal'
import NewSessionForm from '../components/auth/NewSessionForm'
import MultiFileUploader from '../components/canvas/MultiFileUploader'
import AppHeader from '../components/AppHeader'
import { useDateFormat } from '../hooks/useDateFormat'
import { BRAND } from '../lib/config'
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
  const { updateProject } = useProjects()
  const { createSession, updateSession, deleteSession } = useSessions()
  const { formatDate, formatDateTime } = useDateFormat()

  const [showAddBlueprint, setShowAddBlueprint] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [storageLimitMb, setStorageLimitMb] = useState(null)

  // Sort state
  const [bpSort, setBpSort] = useState('updated_desc')

  // Blueprint rename state
  const [renamingSessionId, setRenamingSessionId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  // Inline edit state
  const [editField, setEditField] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  // Load storage limit for quota check
  useEffect(() => {
    if (!user) return
    async function loadLimit() {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (profile?.company_id) {
        const { data: comp } = await supabase
          .from('companies')
          .select('plan')
          .eq('id', profile.company_id)
          .maybeSingle()
        setStorageLimitMb(getStorageLimitMb(comp?.plan))
      }
    }
    loadLimit()
  }, [user])

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

  async function handleRenameSession() {
    const trimmed = renameValue.trim()
    if (!trimmed || !renamingSessionId) {
      setRenamingSessionId(null)
      return
    }
    setRenameSaving(true)
    try {
      await updateSession(renamingSessionId, { project_name: trimmed })
      refetch()
    } catch (err) {
      console.error('Failed to rename blueprint:', err)
    } finally {
      setRenameSaving(false)
      setRenamingSessionId(null)
    }
  }

  async function handleSaveField(fieldName) {
    setSaving(true)
    try {
      await updateProject(projectId, { [fieldName]: editValue || null })
      refetch()
    } catch (err) {
      console.error('Failed to update:', err)
    } finally {
      setSaving(false)
      setEditField(null)
    }
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
        <AppHeader />
        <main className={styles.main}>
          <p className={styles.empty}>Job not found.</p>
        </main>
      </div>
    )
  }

  const emptySessions = sessions.filter(s => !s.blueprint_url)

  return (
    <div className={styles.page}>
      <AppHeader />

      <main className={styles.main}>

        {/* Inline-editable project header */}
        <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Job Overview</div>
        <div style={{ marginBottom: 32 }}>
          <InlineField
            value={project.name}
            placeholder="Job name"
            editField={editField}
            fieldName="name"
            editValue={editValue}
            saving={saving}
            onStartEdit={(v) => { setEditField('name'); setEditValue(v || '') }}
            onSave={() => handleSaveField('name')}
            onCancel={() => setEditField(null)}
            onChangeValue={setEditValue}
            renderDisplay={(val) => <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, display: 'inline' }}>{val}</h1>}
          />
          <div style={{ marginTop: 6 }}>
            <InlineField
              value={project.client_name}
              placeholder="Add client name"
              editField={editField}
              fieldName="client_name"
              editValue={editValue}
              saving={saving}
              onStartEdit={(v) => { setEditField('client_name'); setEditValue(v || '') }}
              onSave={() => handleSaveField('client_name')}
              onCancel={() => setEditField(null)}
              onChangeValue={setEditValue}
              renderDisplay={(val) => <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{val}</span>}
            />
          </div>
          <div style={{ marginTop: 2 }}>
            <InlineField
              value={project.address}
              placeholder="Add address"
              editField={editField}
              fieldName="address"
              editValue={editValue}
              saving={saving}
              onStartEdit={(v) => { setEditField('address'); setEditValue(v || '') }}
              onSave={() => handleSaveField('address')}
              onCancel={() => setEditField(null)}
              onChangeValue={setEditValue}
              renderDisplay={(val) => <span style={{ fontSize: 13, color: 'var(--color-text-muted)', opacity: 0.7 }}>{val}</span>}
            />
          </div>
        </div>

        {/* Multi-file uploader */}
        <MultiFileUploader
          projectId={projectId}
          project={project}
          existingEmptySessions={emptySessions}
          storageLimitMb={storageLimitMb}
          onComplete={refetch}
        />

        {/* Blueprints section */}
        <section className={styles.dashSection}>
          <div className={styles.dashSectionHeader}>
            <h2 className={styles.dashSectionTitle}>Blueprints ({sessions.length})</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {sessions.length > 1 && (
                <select
                  value={bpSort}
                  onChange={e => setBpSort(e.target.value)}
                  style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
                >
                  <option value="updated_desc">Last edited (newest)</option>
                  <option value="updated_asc">Last edited (oldest)</option>
                  <option value="created_desc">Created (newest)</option>
                  <option value="created_asc">Created (oldest)</option>
                  <option value="name_asc">Name A→Z</option>
                  <option value="name_desc">Name Z→A</option>
                </select>
              )}
              <button className={styles.quickBtn} style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => setShowAddBlueprint(true)}>
                + Add Blueprint
              </button>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className={styles.emptyState}>
              <h2>No blueprints yet</h2>
              <p>Drop files above or add your first blueprint to start measuring.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {[...sessions].sort((a, b) => {
                switch (bpSort) {
                  case 'updated_asc': return new Date(a.updated_at ?? a.created_at) - new Date(b.updated_at ?? b.created_at)
                  case 'created_desc': return new Date(b.created_at) - new Date(a.created_at)
                  case 'created_asc': return new Date(a.created_at) - new Date(b.created_at)
                  case 'name_asc': return (a.project_name || '').localeCompare(b.project_name || '')
                  case 'name_desc': return (b.project_name || '').localeCompare(a.project_name || '')
                  default: return new Date(b.updated_at ?? b.created_at) - new Date(a.updated_at ?? a.created_at)
                }
              }).map(session => (
                <div key={session.id} className={styles.card}>
                  <div className={styles.cardMain} onClick={() => navigate(`/session/${session.id}`)}>
                    {renamingSessionId === session.id ? (
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          style={{ padding: '4px 8px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', minWidth: 160, flex: 1 }}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameSession()
                            if (e.key === 'Escape') setRenamingSessionId(null)
                          }}
                          onBlur={handleRenameSession}
                          disabled={renameSaving}
                        />
                      </div>
                    ) : (
                      <div className={styles.cardTitle} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span>{session.project_name}</span>
                        <button
                          onClick={e => { e.stopPropagation(); setRenamingSessionId(session.id); setRenameValue(session.project_name || '') }}
                          style={{ fontSize: 13, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0 2px', opacity: 0.6 }}
                          title="Rename blueprint"
                        >
                          &#9998;
                        </button>
                      </div>
                    )}
                    <div className={styles.cardMeta}>
                      <span>{timeAgo(session.updated_at ?? session.created_at)}</span>
                      {session.blueprint_url ? (
                        <span>Blueprint uploaded</span>
                      ) : (
                        <span style={{ color: '#f59e0b' }}>No file uploaded</span>
                      )}
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

      {showAddBlueprint && (
        <Modal title="Add Blueprint" onClose={() => setShowAddBlueprint(false)}>
          <NewSessionForm
            projectId={projectId}
            onCreate={handleCreateSession}
            onCancel={() => setShowAddBlueprint(false)}
          />
        </Modal>
      )}

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

function InlineField({ value, placeholder, editField, fieldName, editValue, saving, onStartEdit, onSave, onCancel, onChangeValue, renderDisplay }) {
  const isEditing = editField === fieldName

  if (isEditing) {
    return (
      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text"
          value={editValue}
          onChange={e => onChangeValue(e.target.value)}
          style={{ padding: '4px 8px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', minWidth: 200 }}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') onSave()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <button onClick={onSave} disabled={saving} style={{ fontSize: 11, padding: '4px 10px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
          {saving ? '...' : 'Save'}
        </button>
        <button onClick={onCancel} style={{ fontSize: 11, padding: '4px 8px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {value ? renderDisplay(value) : (
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontStyle: 'italic', cursor: 'pointer' }} onClick={() => onStartEdit('')}>
          {placeholder}
        </span>
      )}
      {value && (
        <button
          onClick={() => onStartEdit(value)}
          style={{ fontSize: 13, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0 2px', opacity: 0.6 }}
          title={`Edit ${fieldName.replace(/_/g, ' ')}`}
        >
          &#9998;
        </button>
      )}
    </div>
  )
}
