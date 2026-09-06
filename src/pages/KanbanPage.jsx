import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Columns3, List, Upload } from 'lucide-react'
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

function SortableJobCard({ project, columnId, accent, money }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    data: { columnId, project },
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1, borderTop: `3px solid ${accent}` }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={styles.card} onClick={() => !isDragging && navigate(`/project/${project.id}`)}>
      <div className={styles.cardName}>{project.name}</div>
      {project.address && <div className={styles.cardAddress}>{project.address}</div>}
      <div className={styles.cardMeta}>
        <span>{t('jobs:label.updated', { time: timeAgo(project.updated_at, t) })}</span>
      </div>
      <CardRecordChips money={money} />
      <CardMoneyStrip project={project} money={money} />
    </div>
  )
}

function DroppableColumn({ column, moneyMap }) {
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
          ) : column.projects.map(p => <SortableJobCard key={p.id} project={p} columnId={column.id} accent={accent} money={moneyMap?.get(p.id)} />)}
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
]

export default function KanbanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { columns, loading, error, moveProject, refetch } = useOpportunities()
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

  // Confirm-gated move state (In Progress / Complete)
  const [pendingMove, setPendingMove] = useState(null) // { projectId, fromColumnId, toColumnId, toColName, project }
  const [notifyClient, setNotifyClient] = useState(true)
  const [confirmMoving, setConfirmMoving] = useState(false)

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

    // Gate: columns flagged with notify_status require confirmation + optional client email
    if (toCol?.notify_status) {
      const linkedClient = project?.client_id ? clients.find(c => c.id === project.client_id) : null
      const hasEmail = linkedClient && (linkedClient.primary_email || linkedClient.client_contacts?.some(cc => cc.is_portal_recipient && cc.email))
      setPendingMove({ projectId: active.id, fromColumnId, toColumnId, toColName: resolveColumnLabel(t, toCol), statusType: toCol.notify_status, project, hasEmail: !!hasEmail, clientName: linkedClient?.display_name })
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
    setConfirmMoving(true)
    try {
      const result = await moveProject(pendingMove.projectId, pendingMove.fromColumnId, pendingMove.toColumnId)
      if (result?.error) {
        alert(t('jobs:errors.moveFailed', { error: result.error }))
        setConfirmMoving(false)
        setPendingMove(null)
        return
      }

      // Send client notification (fire-and-forget)
      if (notifyClient && pendingMove.hasEmail) {
        const statusType = pendingMove.statusType
        supabase.functions.invoke('send-status-email', {
          body: { project_id: pendingMove.projectId, status_type: statusType },
        }).catch(err => console.error('Status email failed', err))
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
              onClearAll={clearAll} hasActiveFilters={hasActiveFilters}
            />
            {hasActiveFilters && (
              <div className={styles.filterCount}>{t('jobs:filterCount', { shown: filteredProjects.length, total: totalProjects })}</div>
            )}
            {view === 'kanban' ? (
              <>
                <div className={styles.boardContainer} ref={boardScrollRef}>
                  <DndContext sensors={sensors} collisionDetection={pointerWithin}
                    onDragStart={(e) => setActiveId(e.active.id)}
                    onDragCancel={() => setActiveId(null)}
                    onDragEnd={handleDragEnd}>
                    <div className={styles.board}>
                      {filteredColumns.map(col => <DroppableColumn key={col.id} column={col} moneyMap={moneyMap} />)}
                    </div>
                    <DragOverlay>
                      {activeProject ? <DragCardDisplay project={activeProject} /> : null}
                    </DragOverlay>
                  </DndContext>
                </div>
                <FloatingScrollbar targetRef={boardScrollRef} />
              </>
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
            {pendingMove.hasEmail && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 20 }}>
                <input type="checkbox" checked={notifyClient} onChange={e => setNotifyClient(e.target.checked)} />
                {t('jobs:moveModal.notify', { client: pendingMove.clientName || t('jobs:moveModal.clientFallback') })}
              </label>
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
