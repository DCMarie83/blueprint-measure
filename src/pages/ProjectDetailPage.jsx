import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import SmartBadge from '../components/smartbid/SmartBadge'
import InvoiceStatusBadge from '../components/invoices/InvoiceStatusBadge'
import ChangeOrdersSection from '../components/jobs/ChangeOrdersSection'
import JobTimeSection from '../components/jobs/JobTimeSection'
import DocumentsSection from '../components/documents/DocumentsSection'
import { useInvoices, isOverdue } from '../hooks/useInvoices'
import { useChangeOrders } from '../hooks/useChangeOrders'
import styles from './DashboardPage.module.css'

function fmtMoneyShort(v) {
  const n = Number(v) || 0
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function timeAgo(dateStr, t) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('jobs:time.justNow')
  if (mins < 60) return t('jobs:time.minsAgo', { count: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('jobs:time.hoursAgo', { count: hrs })
  const days = Math.floor(hrs / 24)
  if (days < 7) return t('jobs:time.daysAgo', { count: days })
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ProjectDetailPage() {
  const { t } = useTranslation()
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
  const [showEstimateFork, setShowEstimateFork] = useState(false)
  const [hasMeasuredZones, setHasMeasuredZones] = useState(false)

  // Smart Bid needs measured zones — check once the project's sessions are known.
  useEffect(() => {
    const ids = (sessions || []).map(s => s.id)
    if (ids.length === 0) { setHasMeasuredZones(false); return }
    let cancelled = false
    ;(async () => {
      const { count } = await supabase
        .from('zones')
        .select('id', { count: 'exact', head: true })
        .in('session_id', ids)
        .not('result', 'is', null)
      if (!cancelled) setHasMeasuredZones((count ?? 0) > 0)
    })()
    return () => { cancelled = true }
  }, [sessions])

  // Company plan (for storage limit checks)
  const companyPlan = useCompanyPlan(company)
  const storageLimitMb = companyPlan?.unlimited ? null : (companyPlan?.max_storage_gb || 5) * 1024

  // Client linking
  const { clients } = useClients()
  const { estimates, createEstimate } = useEstimates(projectId)
  const { invoices, refetch: refetchInvoices } = useInvoices({ projectId })
  const { changeOrders, approvedTotal, createChangeOrder, updateChangeOrder, deleteChangeOrder, refetch: refetchChangeOrders } = useChangeOrders(projectId)
  const [collected, setCollected] = useState(0)
  const [projectDocs, setProjectDocs] = useState([])

  // Collected = the payments ledger for this job's invoices.
  useEffect(() => {
    const ids = invoices.map(inv => inv.id)
    if (ids.length === 0) { setCollected(0); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('invoice_payments').select('amount').in('invoice_id', ids)
      if (!cancelled) setCollected((data ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0))
    })()
    return () => { cancelled = true }
  }, [invoices])

  // Documents linked to this job or to its invoices/estimates.
  useEffect(() => {
    if (!projectId || !company?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const invoiceIds = invoices.map(i => i.id)
        const estimateIds = estimates.map(e => e.id)
        const orParts = [`and(linked_type.eq.project,linked_id.eq.${projectId})`]
        if (invoiceIds.length > 0) orParts.push(`and(linked_type.eq.invoice,linked_id.in.(${invoiceIds.join(',')}))`)
        if (estimateIds.length > 0) orParts.push(`and(linked_type.eq.estimate,linked_id.in.(${estimateIds.join(',')}))`)
        const { data } = await supabase
          .from('documents')
          .select('id, linked_type, linked_id, bucket_path, doc_type, original_filename, created_at')
          .eq('company_id', company.id)
          .or(orParts.join(','))
          .order('created_at', { ascending: false })
        if (!cancelled) setProjectDocs(data ?? [])
      } catch { if (!cancelled) setProjectDocs([]) }
    })()
    return () => { cancelled = true }
  }, [projectId, company?.id, invoices, estimates])

  // Money header: contract value + approved change orders = current value;
  // billed excludes draft and void (matching Reports); collected is the ledger.
  const billed = invoices
    .filter(inv => inv.status !== 'draft' && inv.status !== 'void')
    .reduce((s, inv) => s + (Number(inv.total) || 0), 0)
  const contractValue = Number(project?.contract_value) || 0
  const currentValue = contractValue + approvedTotal
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
        
        <main className={styles.main}>
          <BackLink to="/jobs" label={t('jobs:page.title')} />
          <p className={styles.empty}>{t('jobs:errors.notFound')}</p>
        </main>
      </div>
    )
  }

  const emptySessions = sessions.filter(s => !s.blueprint_url)

  return (
    <div className={styles.page}>
      

      <main className={styles.main}>
        <BackLink to="/jobs" label={t('jobs:page.title')} />

        {/* Inline-editable project header */}
        <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{t('jobs:overview.eyebrow')}</div>
        <div style={{ marginBottom: 32 }}>
          <InlineField
            value={project.name}
            placeholder={t('jobs:overview.namePlaceholder')}
            editField={editField}
            fieldName="name"
            editValue={editValue}
            saving={saving}
            onStartEdit={(v) => { setEditField('name'); setEditValue(v || '') }}
            onSave={() => handleSaveField('name')}
            onCancel={() => setEditField(null)}
            onChangeValue={setEditValue}
            renderDisplay={(val) => <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, margin: 0, display: 'inline' }}>{val}</h1>}
          />
          <div style={{ marginTop: 10 }}>
            {linkedClient ? (
              <ClientCard client={linkedClient} onUnlink={async () => { await updateProject(projectId, { client_id: null }); refetch() }} />
            ) : (
              <>
                {project.client_name && (
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                    {t('jobs:overview.clientLabel')} {project.client_name} <span style={{ fontSize: 12, opacity: 0.6 }}>{t('jobs:overview.legacy')}</span>
                  </div>
                )}
                <button
                  onClick={() => { setShowLinkModal(true); setLinkTab('existing'); setModalClientId(null) }}
                  style={{ fontSize: 13, background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '6px 14px', color: 'var(--color-primary)', cursor: 'pointer' }}
                >
                  {t('jobs:overview.linkClient')}
                </button>
              </>
            )}
          </div>
          <div style={{ marginTop: 2 }}>
            <InlineField
              value={project.address}
              placeholder={t('jobs:overview.addressPlaceholder')}
              editField={editField}
              fieldName="address"
              editValue={editValue}
              saving={saving}
              onStartEdit={(v) => { setEditField('address'); setEditValue(v || '') }}
              onSave={() => handleSaveField('address')}
              onCancel={() => setEditField(null)}
              onChangeValue={setEditValue}
              renderDisplay={(val) => <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', opacity: 0.7 }}>{val}</span>}
            />
          </div>

          {/* Schedule fields */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('jobs:schedule.startDate')}</label>
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
              <label style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('jobs:schedule.estCompletion')}</label>
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

          {/* Money header: contract + approved COs = current value · billed · collected */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            {[
              { key: 'currentValue', value: currentValue, sub: approvedTotal !== 0 ? t('jobs:money.withCOs', { base: fmtMoneyShort(contractValue), cos: fmtMoneyShort(approvedTotal) }) : null },
              { key: 'billed', value: billed },
              { key: 'collected', value: collected },
            ].map(stat => (
              <div key={stat.key} style={{ flex: '1 1 140px', maxWidth: 220, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{t(`jobs:money.${stat.key}`)}</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtMoneyShort(stat.value)}</div>
                {stat.sub && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{stat.sub}</div>}
              </div>
            ))}
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
            <h2 className={styles.dashSectionTitle}>{t('jobs:blueprints.title', { count: sessions.length })}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {sessions.length > 1 && (
                <select
                  value={bpSort}
                  onChange={e => setBpSort(e.target.value)}
                  style={{ padding: '5px 10px', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none' }}
                >
                  <option value="updated_desc">{t('jobs:blueprints.sort.updatedDesc')}</option>
                  <option value="updated_asc">{t('jobs:blueprints.sort.updatedAsc')}</option>
                  <option value="created_desc">{t('jobs:blueprints.sort.createdDesc')}</option>
                  <option value="created_asc">{t('jobs:blueprints.sort.createdAsc')}</option>
                  <option value="name_asc">{t('jobs:blueprints.sort.nameAsc')}</option>
                  <option value="name_desc">{t('jobs:blueprints.sort.nameDesc')}</option>
                </select>
              )}
              <button className={styles.quickBtn} style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => setShowAddBlueprint(true)}>
                {t('jobs:blueprints.add')}
              </button>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className={styles.emptyState}>
              <h2>{t('jobs:blueprints.emptyTitle')}</h2>
              <p>{t('jobs:blueprints.emptyBody')}</p>
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
                          title={t('jobs:blueprints.renameTitle')}
                        >
                          &#9998;
                        </button>
                      </div>
                    )}
                    <div className={styles.cardMeta}>
                      <span>{timeAgo(session.updated_at ?? session.created_at, t)}</span>
                      {session.blueprint_url ? (
                        <span>{t('jobs:blueprints.uploaded')}</span>
                      ) : (
                        <span style={{ color: '#f59e0b' }}>{t('jobs:blueprints.noFile')}</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <button className={styles.openBtn} onClick={() => navigate(`/session/${session.id}`)}>
                      {t('jobs:blueprints.open')}
                    </button>
                    <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(session.id)}>
                      {t('common:action.delete')}
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
            <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--color-text-muted)', margin: 0 }}>{t('jobs:materials.title', { count: materialOrders.length })}</h3>
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
                    alert(t('jobs:materials.createFailed', { error: err.message }))
                  }
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {t('jobs:materials.newOrder')}
              </button>
            )}
          </div>
          {materialOrders.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('jobs:materials.empty')}</p>
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
                            catch (err) { alert(t('jobs:materials.renameFailed', { error: err.message })) }
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
                        {order.title || t('jobs:materials.untitled')}
                      </button>
                    )}
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{order.status}</span>
                    {isAdmin && !isEditing && (
                      <>
                        <button
                          onClick={() => { setEditingOrderId(order.id); setEditingTitle(order.title || '') }}
                          style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px 6px' }}
                        >
                          {t('jobs:materials.rename')}
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm(t('jobs:materials.deleteConfirm'))) {
                              try { await deleteMaterialOrder(order.id) }
                              catch (err) { alert(t('jobs:materials.deleteFailed', { error: err.message })) }
                            }
                          }}
                          style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', padding: '4px 6px' }}
                        >
                          {t('common:action.delete')}
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
            <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--color-text-muted)', margin: 0 }}>{t('jobs:estimates.title', { count: estimates.length })}</h3>
            {isAdmin && (
              <button
                onClick={() => setShowEstimateFork(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {t('jobs:estimates.generate')}
              </button>
            )}
          </div>

          {showEstimateFork && (
            <Modal title={t('jobs:estimates.newModalTitle')} onClose={() => setShowEstimateFork(false)}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 8, maxWidth: 560 }}>
                <button
                  onClick={() => {
                    if (!hasMeasuredZones) return
                    trackMaterials('smart_bid_started', { companyId: company?.id, project_id: projectId, surface: 'estimates' })
                    setShowEstimateFork(false)
                    navigate(`/projects/${projectId}/smart-bid`)
                  }}
                  disabled={!hasMeasuredZones}
                  title={hasMeasuredZones ? '' : t('jobs:estimates.measureFirst')}
                  style={{ textAlign: 'left', padding: 16, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', cursor: hasMeasuredZones ? 'pointer' : 'not-allowed', opacity: hasMeasuredZones ? 1 : 0.55 }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('jobs:estimates.smartBid.title')}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                    {hasMeasuredZones ? t('jobs:estimates.smartBid.descReady') : t('jobs:estimates.smartBid.descLocked')}
                  </div>
                </button>
                <button
                  onClick={async () => {
                    setShowEstimateFork(false)
                    try {
                      const est = await createEstimate(projectId)
                      navigate(`/estimates/${est.id}`)
                    } catch (err) {
                      alert(t('jobs:estimates.createFailed', { error: err.message }))
                    }
                  }}
                  style={{ textAlign: 'left', padding: 16, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', cursor: 'pointer' }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('jobs:estimates.manual.title')}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{t('jobs:estimates.manual.desc')}</div>
                </button>
              </div>
            </Modal>
          )}
          {estimates.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('jobs:estimates.empty')}</p>
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
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 9999, background: est.status === 'accepted' ? 'var(--color-success-bg, rgba(74,222,128,0.12))' : est.status === 'declined' ? 'var(--color-danger-bg, rgba(220,38,38,0.08))' : est.status === 'changes_requested' ? 'rgba(242,114,67,0.14)' : 'var(--color-surface-2)', color: est.status === 'accepted' ? 'var(--color-success)' : est.status === 'declined' ? 'var(--color-danger)' : est.status === 'changes_requested' ? '#F27243' : 'var(--color-text-muted)' }}>
                        {est.status === 'changes_requested' ? t('jobs:estimates.statusChangesRequested') : est.status}
                      </span>
                      {est.smart_created && <SmartBadge size="sm" />}
                    </div>
                    {est.title && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{est.estimate_number}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    ${Number(getDisplayTotal(est)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Invoices */}
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--color-text-muted)', margin: '0 0 14px' }}>
            {t('jobs:invoicesSection.title', { count: invoices.length })}
          </h3>
          {invoices.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('jobs:invoicesSection.empty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {invoices.map(inv => (
                <div
                  key={inv.id}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-mono)' }}>{inv.invoice_number}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ''}
                  </span>
                  <InvoiceStatusBadge status={inv.status} isOverdue={isOverdue(inv)} />
                  <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    ${Number(inv.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Change orders */}
        <ChangeOrdersSection
          projectId={projectId}
          projectName={project.name}
          isAdmin={isAdmin}
          changeOrders={changeOrders}
          approvedTotal={approvedTotal}
          createChangeOrder={createChangeOrder}
          updateChangeOrder={updateChangeOrder}
          deleteChangeOrder={deleteChangeOrder}
          refetch={() => { refetchChangeOrders(); refetchInvoices() }}
        />

        {/* Time entries */}
        <JobTimeSection projectId={projectId} companyId={company?.id} />

        {/* Documents */}
        <DocumentsSection documents={projectDocs} />
      </main>

      {showAddBlueprint && (
        <Modal title={t('jobs:blueprints.addModalTitle')} onClose={() => setShowAddBlueprint(false)}>
          <NewSessionForm
            projectId={projectId}
            onCreate={handleCreateSession}
            onCancel={() => setShowAddBlueprint(false)}
          />
        </Modal>
      )}

      {deleteConfirm && (
        <Modal title={t('jobs:blueprints.deleteModalTitle')} onClose={() => setDeleteConfirm(null)}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
            {t('jobs:blueprints.deleteBody')}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '9px 18px', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              onClick={() => setDeleteConfirm(null)}
            >
              {t('common:action.cancel')}
            </button>
            <button
              style={{ background: 'var(--color-danger)', border: 'none', borderRadius: 'var(--radius)', padding: '9px 18px', color: 'white', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => handleDeleteSession(deleteConfirm)}
            >
              {t('common:action.delete')}
            </button>
          </div>
        </Modal>
      )}

      {/* Link Client Modal */}
      {showLinkModal && (
        <Modal title={t('jobs:linkClient.modalTitle')} onClose={() => setShowLinkModal(false)}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 3 }}>
            <button type="button" onClick={() => setLinkTab('existing')} style={{ flex: 1, padding: '7px 10px', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: linkTab === 'existing' ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-bg)', color: linkTab === 'existing' ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>{t('jobs:linkClient.tabExisting')}</button>
            <button type="button" onClick={() => setLinkTab('new')} style={{ flex: 1, padding: '7px 10px', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: linkTab === 'new' ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-bg)', color: linkTab === 'new' ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>{t('jobs:linkClient.tabNew')}</button>
          </div>

          {linkTab === 'existing' ? (
            <div>
              <ClientPicker clients={clients} value={modalClientId} onChange={setModalClientId} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button onClick={() => setShowLinkModal(false)} style={{ padding: '9px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>{t('common:action.cancel')}</button>
                <button disabled={!modalClientId} onClick={async () => { await updateProject(projectId, { client_id: modalClientId }); setShowLinkModal(false); refetch() }} style={{ padding: '9px 18px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: modalClientId ? 1 : 0.5 }}>{t('jobs:linkClient.submit')}</button>
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
  const { t } = useTranslation()
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
          {saving ? '...' : t('common:action.save')}
        </button>
        <button onClick={onCancel} style={{ fontSize: 11, padding: '4px 8px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          {t('common:action.cancel')}
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
          title={t('jobs:overview.editFieldTitle', { field: fieldName.replace(/_/g, ' ') })}
        >
          &#9998;
        </button>
      )}
    </div>
  )
}
