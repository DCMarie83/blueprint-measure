import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Columns3, List } from 'lucide-react'
import {
  DndContext, DragOverlay, useDroppable,
  useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor,
  pointerWithin,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AppHeader from '../components/AppHeader'
import Modal from '../components/ui/Modal'
import ViewToggle from '../components/ui/ViewToggle'
import NewProjectForm from '../components/auth/NewProjectForm'
import JobsListView from '../components/jobs/JobsListView'
import JobsFilterBar from '../components/jobs/JobsFilterBar'
import { useOpportunities } from '../hooks/useOpportunities'
import { useProjects } from '../hooks/useProjects'
import { useEstimates } from '../hooks/useEstimates'
import { useClients } from '../hooks/useClients'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import { supabase } from '../lib/supabase'
import { useViewPreference } from '../hooks/useViewPreference'
import styles from './KanbanPage.module.css'

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

function SortableJobCard({ project, columnId }) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    data: { columnId, project },
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={styles.card} onClick={() => !isDragging && navigate(`/project/${project.id}`)}>
      <div className={styles.cardName}>{project.name}</div>
      {project.address && <div className={styles.cardAddress}>{project.address}</div>}
      <div className={styles.cardMeta}>
        <span>{project.session_count} blueprint{project.session_count !== 1 ? 's' : ''}</span>
        <span>Updated {timeAgo(project.updated_at)}</span>
      </div>
    </div>
  )
}

function DroppableColumn({ column }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { columnId: column.id } })
  return (
    <div ref={setNodeRef} className={`${styles.column} ${isOver ? styles.columnOver : ''}`}>
      <div className={styles.columnHeader}>
        <span className={styles.columnName}>{column.name}</span>
        <span className={styles.columnCount}>{column.projects.length}</span>
      </div>
      <SortableContext items={column.projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
        <div className={styles.cardList}>
          {column.projects.length === 0 ? (
            <div className={styles.emptyColumn}>Drop a job here</div>
          ) : column.projects.map(p => <SortableJobCard key={p.id} project={p} columnId={column.id} />)}
        </div>
      </SortableContext>
    </div>
  )
}

function DragCardDisplay({ project }) {
  return (
    <div className={styles.dragOverlay}>
      <div className={styles.cardName}>{project.name}</div>
      <div className={styles.cardMeta}>
        <span>{project.session_count} blueprint{project.session_count !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}

const VIEW_OPTIONS = [
  { value: 'kanban', icon: Columns3, label: 'Kanban view' },
  { value: 'list', icon: List, label: 'List view' },
]

export default function KanbanPage() {
  const navigate = useNavigate()
  const { columns, loading, error, moveProject, refetch } = useOpportunities()
  const { createProject } = useProjects()
  const { createEstimate } = useEstimates()
  const { clients } = useClients()
  const { userProfile } = useAuth()
  const [view, setView] = useViewPreference('jobs', 'kanban')
  const [activeId, setActiveId] = useState(null)
  const [showNewJob, setShowNewJob] = useState(false)

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
  const statusOptions = columns.map(c => ({ value: c.id, label: c.name }))
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

  // Positions that require confirmation + client email (rename-proof)
  const CONFIRM_POSITIONS = { 8: 'in_progress', 9: 'complete' }

  async function handleDragEnd(event) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const fromColumnId = active.data.current?.columnId
    const toColumnId = over.data.current?.columnId ?? over.id
    if (!fromColumnId || !toColumnId || fromColumnId === toColumnId) return

    const toCol = columns.find(c => c.id === toColumnId)
    const project = allProjects.find(p => p.id === active.id)

    // Gate: positions 8 (In Progress) and 9 (Complete) require confirmation
    if (toCol && CONFIRM_POSITIONS[toCol.position]) {
      const linkedClient = project?.client_id ? clients.find(c => c.id === project.client_id) : null
      const hasEmail = linkedClient && (linkedClient.primary_email || linkedClient.client_contacts?.some(cc => cc.is_portal_recipient && cc.email))
      setPendingMove({ projectId: active.id, fromColumnId, toColumnId, toColName: toCol.name, statusType: CONFIRM_POSITIONS[toCol.position], project, hasEmail: !!hasEmail, clientName: linkedClient?.display_name })
      setNotifyClient(!!hasEmail)
      return
    }

    // All other columns: move silently
    try {
      const result = await moveProject(active.id, fromColumnId, toColumnId)
      if (result?.error) alert('Could not move job: ' + result.error)
    } catch (err) {
      alert('Could not move job: ' + (err.message || 'Unknown error'))
    }
  }

  async function handleConfirmMove() {
    if (!pendingMove) return
    setConfirmMoving(true)
    try {
      const result = await moveProject(pendingMove.projectId, pendingMove.fromColumnId, pendingMove.toColumnId)
      if (result?.error) {
        alert('Could not move job: ' + result.error)
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
      alert('Could not move job: ' + (err.message || 'Unknown error'))
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
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Jobs</h1>
          <div className={styles.headerActions}>
            <ViewToggle view={view} onChange={setView} options={VIEW_OPTIONS} />
            <button className={styles.newJobBtn} onClick={() => setShowNewJob(true)}>
              <Plus size={16} /> New Job
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : error ? (
          <div className={styles.loading} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : totalProjects === 0 && columns.length > 0 ? (
          <div className={styles.emptyBoard}>
            <p>No jobs in the pack yet.</p>
            <button className={styles.newJobBtn} onClick={() => setShowNewJob(true)}>
              <Plus size={16} /> Create your first job
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
              <div className={styles.filterCount}>Showing {filteredProjects.length} of {totalProjects} jobs</div>
            )}
            {view === 'kanban' ? (
              <div className={styles.boardContainer}>
                <DndContext sensors={sensors} collisionDetection={pointerWithin}
                  onDragStart={(e) => setActiveId(e.active.id)}
                  onDragCancel={() => setActiveId(null)}
                  onDragEnd={handleDragEnd}>
                  <div className={styles.board}>
                    {filteredColumns.map(col => <DroppableColumn key={col.id} column={col} />)}
                  </div>
                  <DragOverlay>
                    {activeProject ? <DragCardDisplay project={activeProject} /> : null}
                  </DragOverlay>
                </DndContext>
              </div>
            ) : (
              <JobsListView
                projects={filteredProjects}
                columns={columns}
                onClickProject={(id) => navigate(`/project/${id}`)}
              />
            )}
          </>
        )}
      </main>

      {showNewJob && (
        <Modal title="Create New Job" onClose={() => setShowNewJob(false)}>
          <NewProjectForm onCreate={handleCreateJob} onCancel={() => setShowNewJob(false)} />
        </Modal>
      )}

      {pendingMove && (
        <Modal onClose={() => setPendingMove(null)}>
          <div style={{ padding: 24, maxWidth: 400 }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              Move to {pendingMove.toColName}?
            </h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 16 }}>
              {pendingMove.project?.name}
            </p>
            {pendingMove.hasEmail && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: 20 }}>
                <input type="checkbox" checked={notifyClient} onChange={e => setNotifyClient(e.target.checked)} />
                Notify {pendingMove.clientName || 'client'} by email
              </label>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingMove(null)} style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, color: 'var(--color-text)' }}>
                Cancel
              </button>
              <button onClick={handleConfirmMove} disabled={confirmMoving} style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: confirmMoving ? 0.6 : 1 }}>
                {confirmMoving ? 'Moving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
