import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProject } from '../hooks/useProject'
import { getDisplayTotal } from '../lib/estimateDisplay'
import { useProjects } from '../hooks/useProjects'
import { useSessions } from '../hooks/useSessions'
import { useCompanyPlan } from '../lib/plans'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import Modal from '../components/ui/Modal'
import NewSessionForm from '../components/auth/NewSessionForm'
import MultiFileUploader from '../components/canvas/MultiFileUploader'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import PortalShareSection from '../components/portal/PortalShareSection'
import ClientCard from '../components/clients/ClientCard'
import ClientPicker from '../components/clients/ClientPicker'
import QuickClientForm from '../components/clients/QuickClientForm'
import { useClients } from '../hooks/useClients'
import { useEstimates } from '../hooks/useEstimates'
import { useMaterialOrders } from '../hooks/useMaterialOrders'
import { useDateFormat } from '../hooks/useDateFormat'
import ExpensesSection from '../components/expenses/ExpensesSection'
import { BRAND } from '../lib/config'
import { trackMaterials } from '../lib/analytics'
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
  const { user, userProfile, isSuperAdmin } = useAuth()
  const { company } = useEffectiveCompany()
  const { project, sessions, loading, error, refetch } = useProject(projectId)
  const isAdmin = userProfile?.role === 'contractor_admin' || isSuperAdmin
  const { updateProject } = useProjects()
  const { createSession, updateSession, deleteSession } = useSessions()
  const { formatDate, formatDateTime } = useDateFormat()

  const [showAddBlueprint, setShowAddBlueprint] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Company plan (for storage limit checks)
  const companyPlan = useCompanyPlan(company)
  const storageLimitMb = companyPlan?.unlimited ? null : (companyPlan?.max_storage_gb || 5) * 1024

  // Client linking
  const { clients } = useClients()
  const { estimates, createEstimate } = useEstimates(projectId)
  const { orders: materialOrders, createOrder: createMaterialOrder, updateOrder: updateMaterialOrder, deleteOrder: deleteMaterialOrder } = useMaterialOrders(projectId)
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkTab, setLinkTab] = useState('existing')
  const [modalClientId, setModalClientId] = useState(null)
  const modalQuickRef = useRef(null)
  const linkedClient = project?.client_id ? clients.find(c => c.id === project.client_id) : null

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
          <BackLink to="/jobs" label="Jobs" />
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
        <BackLink to="/jobs" label="Jobs" />

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
          <div style={{ marginTop: 10 }}>
            {linkedClient ? (
              <ClientCard client={linkedClient} onUnlink={async () => { await updateProject(projectId, { client_id: null }); refetch() }} />
            ) : (
              <>
                {project.client_name && (
                  <div style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                    Client: {project.client_name} <span style={{ fontSize: 12, opacity: 0.6 }}>(legacy)</span>
                  </div>
                )}
                <button
                  onClick={() => { setShowLinkModal(true); setLinkTab('existing'); setModalClientId(null) }}
                  style={{ fontSize: 13, background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '6px 14px', color: 'var(--color-primary)', cursor: 'pointer' }}
                >
                  + Link Client
                </button>
              </>
            )}
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

          {/* Schedule fields */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Start Date</label>
              <input
                type="date"
                value={project.scheduled_start ? project.scheduled_start.slice(0, 10) : ''}
                onChange={async (e) => {
                  const val = e.target.value || null
                  try {
                    await updateProject(projectId, { scheduled_start: val ? new Date(val + 'T09:00:00').toISOString() : null })
                    refetch()
                  } catch (err) { console.error('Failed to save start date:', err) }
                }}
                style={{ padding: '4px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Est. Completion</label>
              <input
                type="date"
                value={project.estimated_completion ? project.estimated_completion.slice(0, 10) : ''}
                onChange={async (e) => {
                  const val = e.target.value || null
                  try {
                    await updateProject(projectId, { estimated_completion: val ? new Date(val + 'T17:00:00').toISOString() : null })
                    refetch()
                  } catch (err) { console.error('Failed to save completion date:', err) }
                }}
                style={{ padding: '4px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
          </div>
        </div>

        {/* Customer Portal */}
        <PortalShareSection
          project={project}
          onToggle={async (newEnabled) => {
            await updateProject(projectId, { portal_enabled: newEnabled })
            refetch()
          }}
        />

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
              <h2>No bones in the yard yet.</h2>
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

        {/* Materials Orders */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Materials ({materialOrders.length})</h3>
            {isAdmin && (
              <button
                onClick={async () => {
                  try {
                    const order = await createMaterialOrder(projectId)
                    trackMaterials('material_order_created', {
                      companyId: order.company_id,
                      entityId: order.id,
                      project_id: projectId,
                    })
                    navigate(`/materials/${order.id}`)
                  } catch (err) {
                    alert('Failed to create materials order: ' + err.message)
                  }
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                + New Materials Order
              </button>
            )}
          </div>
          {materialOrders.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No materials orders yet. Create one, then seed it from this job's measurements or rebuild it from a linked estimate.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {materialOrders.map(order => {
                const isEditing = editingOrderId === order.id
                return (
                  <div
                    key={order.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.target.blur() }
                          if (e.key === 'Escape') { setEditingOrderId(null); setEditingTitle('') }
                        }}
                        onBlur={async () => {
                          const next = editingTitle.trim()
                          if (next && next !== (order.title || '')) {
                            try { await updateMaterialOrder(order.id, { title: next }) }
                            catch (err) { alert('Failed to rename: ' + err.message) }
                          }
                          setEditingOrderId(null)
                          setEditingTitle('')
                        }}
                        style={{ flex: 1, fontSize: 14, fontWeight: 600, padding: '6px 10px', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)' }}
                      />
                    ) : (
                      <button
                        onClick={() => navigate(`/materials/${order.id}`)}
                        style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 14, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text, #1b2426)' }}
                      >
                        {order.title || 'Untitled order'}
                      </button>
                    )}
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{order.status}</span>
                    {isAdmin && !isEditing && (
                      <>
                        <button
                          onClick={() => { setEditingOrderId(order.id); setEditingTitle(order.title || '') }}
                          style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px 6px' }}
                        >
                          Rename
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm('Delete this materials order? This cannot be undone.')) {
                              try { await deleteMaterialOrder(order.id) }
                              catch (err) { alert('Failed to delete: ' + err.message) }
                            }
                          }}
                          style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', padding: '4px 6px' }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Expenses */}
        <ExpensesSection projectId={projectId} companyId={company?.id} isAdmin={isAdmin} />

        {/* Estimates */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Estimates ({estimates.length})</h3>
            {isAdmin && (
              <button
                onClick={async () => {
                  try {
                    const est = await createEstimate(projectId)
                    navigate(`/estimates/${est.id}`)
                  } catch (err) {
                    alert('Failed to create estimate: ' + err.message)
                  }
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                + Generate Estimate
              </button>
            )}
          </div>
          {estimates.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No estimates yet. Click Generate to fetch one.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {estimates.map(est => (
                <div
                  key={est.id}
                  onClick={() => navigate(`/estimates/${est.id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'border-color 0.15s' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{est.title || est.estimate_number}</span>
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 9999, background: est.status === 'accepted' ? 'var(--color-success-bg, rgba(74,222,128,0.12))' : est.status === 'declined' ? 'var(--color-danger-bg, rgba(220,38,38,0.08))' : 'var(--color-surface-2)', color: est.status === 'accepted' ? 'var(--color-success)' : est.status === 'declined' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                        {est.status}
                      </span>
                    </div>
                    {est.title && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{est.estimate_number}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    ${Number(getDisplayTotal(est)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
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

      {/* Link Client Modal */}
      {showLinkModal && (
        <Modal title="Link Client to Job" onClose={() => setShowLinkModal(false)}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 3 }}>
            <button type="button" onClick={() => setLinkTab('existing')} style={{ flex: 1, padding: '7px 10px', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: linkTab === 'existing' ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-bg)', color: linkTab === 'existing' ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>Link Existing</button>
            <button type="button" onClick={() => setLinkTab('new')} style={{ flex: 1, padding: '7px 10px', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: linkTab === 'new' ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-bg)', color: linkTab === 'new' ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>Create New</button>
          </div>

          {linkTab === 'existing' ? (
            <div>
              <ClientPicker clients={clients} value={modalClientId} onChange={setModalClientId} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button onClick={() => setShowLinkModal(false)} style={{ padding: '9px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Cancel</button>
                <button disabled={!modalClientId} onClick={async () => { await updateProject(projectId, { client_id: modalClientId }); setShowLinkModal(false); refetch() }} style={{ padding: '9px 18px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: modalClientId ? 1 : 0.5 }}>Link Client</button>
              </div>
            </div>
          ) : (
            <QuickClientForm
              ref={modalQuickRef}
              onCreated={async (newClient) => {
                await updateProject(projectId, { client_id: newClient.id })
                setShowLinkModal(false)
                refetch()
              }}
            />
          )}
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
