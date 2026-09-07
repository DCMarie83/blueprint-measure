import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Columns3, List, Upload, XCircle } from 'lucide-react'
import {
  DndContext, DragOverlay, useDroppable,
  useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor,
  pointerWithin,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Modal from '../components/ui/Modal'
import ViewToggle from '../components/ui/ViewToggle'
import NewProjectForm from '../components/auth/NewProjectForm'
import JobImportModal from '../components/jobs/JobImportModal'
import EstimateImportModal from '../components/estimates/EstimateImportModal'
import ChangeOrderImportModal from '../components/jobs/ChangeOrderImportModal'
import DocumentImportModal from '../components/import/DocumentImportModal'
import { useJobMoneyMap } from '../hooks/useJobMoneyMap'
import FloatingScrollbar from '../components/common/FloatingScrollbar'
import JobsListView, { DOT_COLORS } from '../components/jobs/JobsListView'
import JobsFilterBar from '../components/jobs/JobsFilterBar'
import LostJobsView, { markProjectLost } from '../components/jobs/LostJobsView'
import { useOpportunities } from '../hooks/useOpportunities'
import { useProjects } from '../hooks/useProjects'
import { resolveColumnLabel } from '../lib/kanbanColumnLabel'
import { useEstimates } from '../hooks/useEstimates'
import { useClients } from '../hooks/useClients'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import { supabase } from '../lib/supabase'
import { useViewPreference } from '../hooks/useViewPreference'
import styles from './KanbanPage.module.css'

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

function fmtMoneyCompact(v) {
  const n = Number(v) || 0
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// Record chips: documents / estimates / invoices counts, rendered ONLY when
// nonzero. Data rides the single company-scoped useJobMoneyMap fetch — never
// per-card queries.
function CardRecordChips({ money }) {
  const { t } = useTranslation()
  const chips = [
    { key: 'docs', count: money?.documentCount || 0, labelKey: 'jobs:card.docsCount' },
    { key: 'estimates', count: money?.estimateCount || 0, labelKey: 'jobs:card.estimatesCount' },
    { key: 'invoices', count: money?.invoiceCount || 0, labelKey: 'jobs:card.invoicesCount' },
  ].filter(c => c.count > 0)
  if (chips.length === 0) return null
  return (
    <div className={styles.cardChips}>
      {chips.map(c => (
        <span key={c.key} className={styles.cardChip}>{t(c.labelKey, { count: c.count })}</span>
      ))}
    </div>
  )
}

// Compact money strip: current value (contract + approved COs), billed,
// collected, and an open-CO count. Render-only — data comes from the single
// company-scoped useJobMoneyMap fetch, never per-card queries.
function CardMoneyStrip({ project, money }) {
  const { t } = useTranslation()
  const currentValue = (Number(project.contract_value) || 0) + (money?.approvedCO || 0)
  const billed = money?.billed || 0
  const collected = money?.collected || 0
  const openCos = money?.openCoCount || 0
  if (currentValue === 0 && billed === 0 && collected === 0 && openCos === 0) return null
  return (
    <div className={styles.cardMeta} style={{ marginTop: 4, gap: 8, flexWrap: 'wrap' }}>
      {currentValue !== 0 && <span title={t('jobs:money.currentValue')}>{fmtMoneyCompact(currentValue)}</span>}
      {billed !== 0 && <span>{t('jobs:money.billedShort', { amount: fmtMoneyCompact(billed) })}</span>}
      {collected !== 0 && <span>{t('jobs:money.collectedShort', { amount: fmtMoneyCompact(collected) })}</span>}
      {openCos > 0 && <span style={{ color: '#F27243', fontWeight: 600 }}>{t('jobs:money.openCos', { count: openCos })}</span>}
    </div>
  )
}

function truncate(text, max = 70) {
  const s = String(text || '').trim()
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function SortableJobCard({ project, columnId, columnKey, accent, money, onMarkLost }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    data: { columnId, project },
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1, borderTop: `3px solid ${accent}` }
  const response = money?.latestResponse

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={styles.card} onClick={() => !isDragging && navigate(`/project/${project.id}`)}>
      <div className={styles.cardName}>{project.name}</div>
      {project.address && <div className={styles.cardAddress}>{project.address}</div>}
      <div className={styles.cardMeta}>
        <span>{t('jobs:label.updated', { time: timeAgo(project.updated_at, t) })}</span>
      </div>
      {/* Client response chips: changes requested (any column) / declined info */}
      {response?.type === 'changes_requested' && (
        <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: '#F27243' }}>
          {t('jobs:card.changesRequested')}{response.text ? `: ${truncate(response.text)}` : ''}
        </div>
      )}
      {columnKey === 'declined' && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {response?.type === 'declined' && response.text && (
            <div style={{ fontSize: 11, color: 'var(--color-danger, #dc2626)' }}>{truncate(response.text)}</div>
          )}
          {project.follow_up_at && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {t('jobs:card.followUp', { date: new Date(project.follow_up_at + 'T00:00:00').toLocaleDateString() })}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onMarkLost?.(project) }}
            style={{ alignSelf: 'flex-start', marginTop: 2, fontSize: 11, fontWeight: 600, padding: '2px 8px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-pill, 9999px)', color: 'var(--color-text-muted)', cursor: 'pointer' }}
          >{t('jobs:lost.markLost')}</button>
        </div>
      )}
      <CardRecordChips money={money} />
      <CardMoneyStrip project={project} money={money} />
    </div>
  )
}

function DroppableColumn({ column, moneyMap, onMarkLost }) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { columnId: column.id } })
  // Reuse the jobs list-view positional palette so the card top-accent matches
  // the status dot shown in list view (same map, keyed by column position).
  const accent = DOT_COLORS[((column.position ?? 0) - 1) % DOT_COLORS.length] || 'var(--color-border)'
  return (
    <div ref={setNodeRef} className={`${styles.column} ${isOver ? styles.columnOver : ''}`}>
      <div className={styles.columnHeader}>
        <span className={styles.columnName}>{resolveColumnLabel(t, column)}</span>
        <span className={styles.columnCount}>{column.projects.length}</span>
      </div>
      <SortableContext items={column.projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
        <div className={styles.cardList}>
          {column.projects.length === 0 ? (
            <div className={styles.emptyColumn}>{t('jobs:column.emptyDrop')}</div>
          ) : column.projects.map(p => <SortableJobCard key={p.id} project={p} columnId={column.id} columnKey={column.column_key} accent={accent} money={moneyMap?.get(p.id)} onMarkLost={onMarkLost} />)}
        </div>
      </SortableContext>
    </div>
  )
}

function DragCardDisplay({ project }) {
  const { t } = useTranslation()
  return (
    <div className={styles.dragOverlay}>
      <div className={styles.cardName}>{project.name}</div>
      <div className={styles.cardMeta}>
        <span>{t('jobs:label.updated', { time: timeAgo(project.updated_at, t) })}</span>
      </div>
    </div>
  )
}

const VIEW_OPTIONS = [
  { value: 'kanban', icon: Columns3, label: 'jobs:view.kanban' },
  { value: 'list', icon: List, label: 'jobs:view.list' },
  { value: 'lost', icon: XCircle, label: 'jobs:view.lost' },
]

// Board window: jobs with updated_at inside the range load; the rest stay in
// the database. Persisted for the session like the invoice sort.
const JOBS_WINDOW_KEY = 'rivetdog_jobs_window'
const WINDOW_CHOICES = ['30', '90', '180', 'all', 'custom']

function loadWindowPref() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(JOBS_WINDOW_KEY) || 'null')
    if (saved && WINDOW_CHOICES.includes(saved.choice)) return saved
  } catch { /* ignore */ }
  return { choice: '90', from: '', to: '' }
}

function windowFromChoice({ choice, from, to }) {
  if (choice === 'all') return { windowFrom: null, windowTo: null }
  if (choice === 'custom') return { windowFrom: from || null, windowTo: to || null }
  const days = Number(choice)
  const d = new Date()
  d.setDate(d.getDate() - days)
  return { windowFrom: d.toISOString().slice(0, 10), windowTo: null }
}

export default function KanbanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [windowPref, setWindowPref] = useState(loadWindowPref)
  const { windowFrom, windowTo } = windowFromChoice(windowPref)
  const { columns, totalCount, loading, error, moveProject, refetch } = useOpportunities({ windowFrom, windowTo })

  function updateWindowPref(next) {
    setWindowPref(next)
    try { sessionStorage.setItem(JOBS_WINDOW_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }
  const { createProject } = useProjects()
  const { createEstimate } = useEstimates()
  const { clients } = useClients()
  const { userProfile } = useAuth()
  const [view, setView] = useViewPreference('jobs', 'kanban')
  const [activeId, setActiveId] = useState(null)
  const [showNewJob, setShowNewJob] = useState(false)
  const boardScrollRef = useRef(null)
  const [showImport, setShowImport] = useState(null) // 'jobs' | 'estimates' | 'estimateDocs' | 'changeOrders' | null
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const { moneyMap } = useJobMoneyMap()

  // Confirm-gated move state: any column with notify_status set opens the
  // dialog BEFORE anything is written. The dialog is column-aware.
  const [pendingMove, setPendingMove] = useState(null) // { projectId, fromColumnId, toColumnId, toColName, statusType, project, hasEmail, clientName }
  const [notifyClient, setNotifyClient] = useState(true)
  const [confirmMoving, setConfirmMoving] = useState(false)
  const [dlg, setDlg] = useState({ amount: '', startDate: '', windowText: '', completionDate: '', includePortal: false, createInvoice: true })
  const [dlgError, setDlgError] = useState(null)
  // Inline board notice: the card moved but the client email did not send.
  const [moveNotice, setMoveNotice] = useState(null)

  // Mark lost prompt (from a Declined-column card): optional reason.
  const [lostPrompt, setLostPrompt] = useState(null) // { projectId, name, clientId }
  const [lostReason, setLostReason] = useState('')
  const [lostSaving, setLostSaving] = useState(false)

  async function handleMarkLost() {
    if (!lostPrompt) return
    setLostSaving(true)
    try {
      await markProjectLost(supabase, {
        projectId: lostPrompt.projectId,
        clientId: lostPrompt.clientId,
        companyId: effectiveCompanyId,
        reason: lostReason,
      })
      setLostPrompt(null)
      setLostReason('')
      await refetch()
    } catch (err) {
      alert(t('jobs:lost.markFailed', { error: err.message || t('common:misc.unknownError') }))
    } finally {
      setLostSaving(false)
    }
  }

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [teamMembers, setTeamMembers] = useState([])

  const { companyId: effectiveCompanyId } = useEffectiveCompany()

  useEffect(() => {
    if (!effectiveCompanyId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email')
        .eq('company_id', effectiveCompanyId)
        .is('deleted_at', null)
      if (!cancelled) setTeamMembers(data ?? [])
    })()
    return () => { cancelled = true }
  }, [effectiveCompanyId])

  // Filter options
  const statusOptions = columns.map(c => ({ value: c.id, label: resolveColumnLabel(t, c) }))
  const clientOptions = clients.map(c => ({ value: c.id, label: c.display_name })).sort((a, b) => a.label.localeCompare(b.label))
  const ownerOptions = teamMembers.map(m => ({ value: m.user_id, label: m.full_name || m.email }))

  // Filter logic
  const allProjects = columns.flatMap(c => c.projects ?? [])
  const filteredProjects = allProjects.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      const linked = clients.find(c => c.id === p.client_id)
      const haystacks = [p.name, p.address, p.client_name, linked?.display_name, linked?.business_name]
      if (!haystacks.some(s => s && s.toLowerCase().includes(q))) return false
    }
    if (statusFilter !== 'all' && p.kanban_column_id !== statusFilter) return false
    if (typeFilter !== 'all') {
      const linked = clients.find(c => c.id === p.client_id)
      if (!linked || linked.client_type !== typeFilter) return false
    }
    if (ownerFilter !== 'all' && p.user_id !== ownerFilter) return false
    if (clientFilter !== 'all' && p.client_id !== clientFilter) return false
    return true
  })

  const filteredColumns = columns.map(col => ({
    ...col,
    projects: filteredProjects.filter(p => p.kanban_column_id === col.id),
  }))

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'all' || typeFilter !== 'all' || ownerFilter !== 'all' || clientFilter !== 'all'
  function clearAll() { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); setOwnerFilter('all'); setClientFilter('all') }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeProject = activeId
    ? allProjects.find(p => p.id === activeId)
    : null

  const totalProjects = allProjects.length

  async function handleDragEnd(event) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const fromColumnId = active.data.current?.columnId
    const toColumnId = over.data.current?.columnId ?? over.id
    if (!fromColumnId || !toColumnId || fromColumnId === toColumnId) return

    const toCol = columns.find(c => c.id === toColumnId)
    const project = allProjects.find(p => p.id === active.id)

    // Gate: columns flagged with notify_status require confirmation + optional
    // client email. The dialog opens before anything is written.
    if (toCol?.notify_status) {
      const linkedClient = project?.client_id ? clients.find(c => c.id === project.client_id) : null
      const hasEmail = linkedClient && (linkedClient.primary_email || linkedClient.client_contacts?.some(cc => cc.is_portal_recipient && cc.email))
      const statusType = toCol.notify_status
      setDlg({
        amount: statusType === 'deposit_received' ? String(moneyMap.get(active.id)?.collected ?? '') : '',
        startDate: project?.scheduled_start ? String(project.scheduled_start).slice(0, 10) : '',
        windowText: '',
        completionDate: project?.estimated_completion ? String(project.estimated_completion).slice(0, 10) : '',
        includePortal: false,
        createInvoice: true,
      })
      setDlgError(null)
      setPendingMove({ projectId: active.id, fromColumnId, toColumnId, toColName: resolveColumnLabel(t, toCol), statusType, project, hasEmail: !!hasEmail, clientName: linkedClient?.display_name })
      setNotifyClient(!!hasEmail)
      return
    }

    // All other columns: move silently
    try {
      const result = await moveProject(active.id, fromColumnId, toColumnId)
      if (result?.error) alert(t('jobs:errors.moveFailed', { error: result.error }))
    } catch (err) {
      alert(t('jobs:errors.moveFailed', { error: err.message || t('common:misc.unknownError') }))
    }
  }

  async function handleConfirmMove() {
    if (!pendingMove) return
    const { projectId, statusType } = pendingMove
    const willNotify = notifyClient && pendingMove.hasEmail

    // Scheduled: a start date is required to notify the client.
    if (statusType === 'scheduled' && willNotify && !dlg.startDate) {
      setDlgError(t('jobs:moveModal.startDateRequired'))
      return
    }

    setConfirmMoving(true)
    setDlgError(null)
    try {
      const result = await moveProject(projectId, pendingMove.fromColumnId, pendingMove.toColumnId)
      if (result?.error) {
        alert(t('jobs:errors.moveFailed', { error: result.error }))
        setConfirmMoving(false)
        setPendingMove(null)
        return
      }

      // Column-specific project writes (dates, portal), independent of notify.
      const projectPatch = {}
      if (statusType === 'scheduled') {
        if (dlg.startDate) projectPatch.scheduled_start = new Date(dlg.startDate + 'T09:00:00').toISOString()
        if (dlg.completionDate) projectPatch.estimated_completion = new Date(dlg.completionDate + 'T17:00:00').toISOString()
        if (dlg.includePortal) projectPatch.portal_enabled = true
      }
      if (statusType === 'in_progress' && dlg.completionDate) {
        projectPatch.estimated_completion = new Date(dlg.completionDate + 'T17:00:00').toISOString()
      }
      // Complete + final invoice: no email at move time — the completion
      // notice rides the invoice email instead (pending flag on the job).
      const deferNotice = statusType === 'complete' && dlg.createInvoice
      if (deferNotice && willNotify) projectPatch.completion_notice_pending = true
      if (Object.keys(projectPatch).length > 0) {
        const { error: patchErr } = await supabase.from('projects').update(projectPatch).eq('id', projectId)
        if (patchErr) console.error('Move detail write failed', patchErr)
      }

      // Client notification: awaited, so a failure surfaces on the board.
      let emailFailed = null
      if (willNotify && !deferNotice) {
        const payload = {
          amount: statusType === 'deposit_received' ? Number(dlg.amount) || 0 : undefined,
          window: statusType === 'scheduled' && dlg.windowText.trim() ? dlg.windowText.trim() : undefined,
          scheduled_start: projectPatch.scheduled_start,
          estimated_completion: projectPatch.estimated_completion,
          include_portal_link: statusType === 'scheduled' ? dlg.includePortal : undefined,
        }
        const { error: fnErr } = await supabase.functions.invoke('send-status-email', {
          body: { project_id: projectId, status_type: statusType, payload },
        })
        if (fnErr) {
          let msg = fnErr.message
          try {
            const body = await fnErr.context?.json()
            if (body?.error) msg = body.error
          } catch { /* keep the generic message */ }
          emailFailed = msg
        }
      }

      if (emailFailed) {
        setMoveNotice(t('jobs:moveModal.emailFailed', { error: emailFailed }))
      } else {
        setMoveNotice(null)
        // Complete: offer the final invoice, prefilled from the job.
        if (statusType === 'complete' && dlg.createInvoice) {
          navigate(`/invoices/new?from_project=${projectId}`)
        }
      }
    } catch (err) {
      alert(t('jobs:errors.moveFailed', { error: err.message || t('common:misc.unknownError') }))
    } finally {
      setConfirmMoving(false)
      setPendingMove(null)
    }
  }

  async function handleCreateJob(payload, buildMethod) {
    const project = await createProject(payload)
    setShowNewJob(false)
    if (buildMethod === 'manual') {
      try {
        const est = await createEstimate(project.id)
        navigate(`/estimates/${est.id}`)
      } catch {
        navigate(`/project/${project.id}`)
      }
      return
    }
    await refetch()
  }

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('jobs:page.title')}</h1>
          <div className={styles.headerActions}>
            <ViewToggle view={view} onChange={setView} options={VIEW_OPTIONS.map(o => ({ ...o, label: t(o.label) }))} />
            <div style={{ position: 'relative' }}>
              <button className={`${styles.newJobBtn} ${styles.importJobsBtn}`} onClick={() => setImportMenuOpen(o => !o)}>
                <Upload size={16} /> {t('jobs:import.button')} ▾
              </button>
              {importMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setImportMenuOpen(false)} />
                  <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 41, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 220, overflow: 'hidden' }}>
                    {[
                      { key: 'jobs', label: t('jobs:import.menuJobs') },
                      { key: 'estimates', label: t('jobs:import.menuEstimates') },
                      { key: 'estimateDocs', label: t('jobs:import.menuEstimateDocs') },
                      { key: 'changeOrders', label: t('jobs:import.menuChangeOrders') },
                    ].map(item => (
                      <button
                        key={item.key}
                        onClick={() => { setImportMenuOpen(false); setShowImport(item.key) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text, #1b2426)' }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button className={styles.newJobBtn} onClick={() => setShowNewJob(true)}>
              <Plus size={16} /> {t('jobs:page.newJob')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>{t('common:misc.loading')}</div>
        ) : error ? (
          <div className={styles.loading} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : totalProjects === 0 && columns.length > 0 ? (
          <div className={styles.emptyBoard}>
            <p>{t('jobs:empty.title')}</p>
            <button className={styles.newJobBtn} onClick={() => setShowNewJob(true)}>
              <Plus size={16} /> {t('jobs:empty.createFirst')}
            </button>
          </div>
        ) : (
          <>
            <JobsFilterBar
              search={search} onSearchChange={setSearch}
              statusFilter={statusFilter} onStatusChange={setStatusFilter} statusOptions={statusOptions}
              typeFilter={typeFilter} onTypeChange={setTypeFilter}
              ownerFilter={ownerFilter} onOwnerChange={setOwnerFilter} ownerOptions={ownerOptions}
              clientFilter={clientFilter} onClientChange={setClientFilter} clientOptions={clientOptions}
              windowChoice={windowPref.choice}
              onWindowChange={choice => updateWindowPref({ ...windowPref, choice })}
              customFrom={windowPref.from} customTo={windowPref.to}
              onCustomFromChange={from => updateWindowPref({ ...windowPref, from })}
              onCustomToChange={to => updateWindowPref({ ...windowPref, to })}
              onClearAll={clearAll} hasActiveFilters={hasActiveFilters}
            />
            <div className={styles.filterCount}>
              {t('jobs:window.showing', {
                shown: hasActiveFilters ? filteredProjects.length : totalProjects,
                total: totalCount,
                range: t('jobs:window.range.' + windowPref.choice),
              })}
            </div>
            {moveNotice && (
              <div role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, margin: '0 0 12px', padding: '10px 14px', background: 'var(--color-danger-bg, rgba(220,38,38,0.08))', border: '1px solid var(--color-danger, #dc2626)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--color-danger, #dc2626)' }}>
                <span>{moveNotice}</span>
                <button onClick={() => setMoveNotice(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            )}
            {view === 'kanban' ? (
              <>
                <div className={styles.boardContainer} ref={boardScrollRef}>
                  <DndContext sensors={sensors} collisionDetection={pointerWithin}
                    onDragStart={(e) => setActiveId(e.active.id)}
                    onDragCancel={() => setActiveId(null)}
                    onDragEnd={handleDragEnd}>
                    <div className={styles.board}>
                      {filteredColumns.map(col => <DroppableColumn key={col.id} column={col} moneyMap={moneyMap} onMarkLost={p => setLostPrompt({ projectId: p.id, name: p.name, clientId: p.client_id })} />)}
                    </div>
                    <DragOverlay>
                      {activeProject ? <DragCardDisplay project={activeProject} /> : null}
                    </DragOverlay>
                  </DndContext>
                </div>
                <FloatingScrollbar targetRef={boardScrollRef} />
              </>
            ) : view === 'lost' ? (
              <LostJobsView companyId={effectiveCompanyId} refreshBoard={refetch} />
            ) : (
              <JobsListView
                projects={filteredProjects}
                columns={columns}
                moneyMap={moneyMap}
                onClickProject={(id) => navigate(`/project/${id}`)}
              />
            )}
          </>
        )}
      </main>

      {lostPrompt && (
        <Modal onClose={() => { setLostPrompt(null); setLostReason('') }}>
          <div style={{ padding: 24, maxWidth: 400 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{t('jobs:lost.promptTitle')}</h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 12 }}>{lostPrompt.name}</p>
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('jobs:lost.reasonOptional')}</span>
              <textarea rows={2} value={lostReason} onChange={e => setLostReason(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setLostPrompt(null); setLostReason('') }} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, color: 'var(--color-text)' }}>{t('common:action.cancel')}</button>
              <button onClick={handleMarkLost} disabled={lostSaving} style={{ padding: '8px 16px', background: 'var(--color-danger, #dc2626)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: lostSaving ? 0.6 : 1 }}>{lostSaving ? '…' : t('jobs:lost.markLost')}</button>
            </div>
          </div>
        </Modal>
      )}

      {showNewJob && (
        <Modal title={t('jobs:newJobModalTitle')} onClose={() => setShowNewJob(false)}>
          <NewProjectForm onCreate={handleCreateJob} onCancel={() => setShowNewJob(false)} />
        </Modal>
      )}

      {showImport === 'jobs' && (
        <Modal title={t('jobs:import.title')} onClose={() => setShowImport(null)}>
          <JobImportModal onClose={() => setShowImport(null)} onImported={refetch} />
        </Modal>
      )}

      {showImport === 'estimates' && (
        <Modal title={t('estimates:import.title')} onClose={() => setShowImport(null)}>
          <EstimateImportModal onClose={() => setShowImport(null)} onImported={refetch} />
        </Modal>
      )}

      {showImport === 'estimateDocs' && (
        <Modal title={t('import:docs.titleEstimates')} onClose={() => setShowImport(null)}>
          <DocumentImportModal entity="estimates" onClose={() => setShowImport(null)} onImported={refetch} />
        </Modal>
      )}

      {showImport === 'changeOrders' && (
        <Modal title={t('jobs:changeOrders.import.title')} onClose={() => setShowImport(null)}>
          <ChangeOrderImportModal onClose={() => setShowImport(null)} onImported={refetch} />
        </Modal>
      )}

      {pendingMove && (
        <Modal onClose={() => setPendingMove(null)}>
          <div style={{ padding: 24, maxWidth: 400 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              {t('jobs:moveModal.title', { col: pendingMove.toColName })}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
              {pendingMove.project?.name}
            </p>
            {/* Column-aware fields */}
            {pendingMove.statusType === 'deposit_received' && (
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('jobs:moveModal.depositAmount')}</span>
                <input type="number" step="0.01" min="0" value={dlg.amount} onChange={e => setDlg(d => ({ ...d, amount: e.target.value }))}
                  style={{ width: 160, padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{t('jobs:moveModal.depositHint')}</span>
              </label>
            )}
            {pendingMove.statusType === 'scheduled' && (
              <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('jobs:moveModal.startDate')}</span>
                  <input type="date" value={dlg.startDate} onChange={e => setDlg(d => ({ ...d, startDate: e.target.value }))}
                    style={{ padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('jobs:moveModal.timeWindow')}</span>
                  <input type="text" value={dlg.windowText} onChange={e => setDlg(d => ({ ...d, windowText: e.target.value }))} placeholder={t('jobs:moveModal.timeWindowPlaceholder')}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('jobs:moveModal.expectedCompletion')}</span>
                  <input type="date" value={dlg.completionDate} onChange={e => setDlg(d => ({ ...d, completionDate: e.target.value }))}
                    style={{ padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={dlg.includePortal} onChange={e => setDlg(d => ({ ...d, includePortal: e.target.checked }))} />
                  {t('jobs:moveModal.enablePortal')}
                </label>
              </div>
            )}
            {pendingMove.statusType === 'in_progress' && (
              <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingMove.project?.scheduled_start && (
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                    {t('jobs:moveModal.scheduledFor', { date: new Date(pendingMove.project.scheduled_start).toLocaleDateString() })}
                  </p>
                )}
                <label>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>{t('jobs:moveModal.expectedCompletion')}</span>
                  <input type="date" value={dlg.completionDate} onChange={e => setDlg(d => ({ ...d, completionDate: e.target.value }))}
                    style={{ padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
                </label>
              </div>
            )}
            {pendingMove.statusType === 'complete' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={dlg.createInvoice} onChange={e => setDlg(d => ({ ...d, createInvoice: e.target.checked }))} />
                {t('jobs:moveModal.createFinalInvoice')}
              </label>
            )}
            {pendingMove.hasEmail && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 20 }}>
                <input type="checkbox" checked={notifyClient} onChange={e => setNotifyClient(e.target.checked)} />
                {pendingMove.statusType === 'complete' && dlg.createInvoice
                  ? t('jobs:moveModal.notifyWithInvoice')
                  : t('jobs:moveModal.notify', { client: pendingMove.clientName || t('jobs:moveModal.clientFallback') })}
              </label>
            )}
            {dlgError && (
              <p role="alert" style={{ fontSize: 13, color: 'var(--color-danger, #dc2626)', margin: '0 0 12px' }}>{dlgError}</p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingMove(null)} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, color: 'var(--color-text)' }}>
                {t('common:action.cancel')}
              </button>
              <button onClick={handleConfirmMove} disabled={confirmMoving} style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: confirmMoving ? 0.6 : 1 }}>
                {confirmMoving ? t('jobs:moveModal.moving') : t('common:action.confirm')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
