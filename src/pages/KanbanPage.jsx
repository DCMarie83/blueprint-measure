import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Columns3, List } from 'lucide-react'
import {
  DndContext, DragOverlay, useDroppable,
  useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor,
  closestCenter,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AppHeader from '../components/AppHeader'
import Modal from '../components/ui/Modal'
import ViewToggle from '../components/ui/ViewToggle'
import NewProjectForm from '../components/auth/NewProjectForm'
import JobsListView from '../components/jobs/JobsListView'
import { useOpportunities } from '../hooks/useOpportunities'
import { useProjects } from '../hooks/useProjects'
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
  const [view, setView] = useViewPreference('jobs', 'kanban')
  const [activeId, setActiveId] = useState(null)
  const [showNewJob, setShowNewJob] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeProject = activeId
    ? columns.flatMap(c => c.projects).find(p => p.id === activeId)
    : null

  const totalProjects = columns.reduce((sum, col) => sum + col.projects.length, 0)

  async function handleDragEnd(event) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const fromColumnId = active.data.current?.columnId
    const toColumnId = over.data.current?.columnId ?? over.id
    if (!fromColumnId || !toColumnId || fromColumnId === toColumnId) return
    const result = await moveProject(active.id, fromColumnId, toColumnId)
    if (result?.error) alert('Could not move card: ' + result.error)
  }

  async function handleCreateJob(payload) {
    await createProject(payload)
    setShowNewJob(false)
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
            <p>No jobs yet.</p>
            <button className={styles.newJobBtn} onClick={() => setShowNewJob(true)}>
              <Plus size={16} /> Create your first job
            </button>
          </div>
        ) : view === 'kanban' ? (
          <div className={styles.boardContainer}>
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragStart={(e) => setActiveId(e.active.id)}
              onDragCancel={() => setActiveId(null)}
              onDragEnd={handleDragEnd}>
              <div className={styles.board}>
                {columns.map(col => <DroppableColumn key={col.id} column={col} />)}
              </div>
              <DragOverlay>
                {activeProject ? <DragCardDisplay project={activeProject} /> : null}
              </DragOverlay>
            </DndContext>
          </div>
        ) : (
          <JobsListView
            projects={columns.flatMap(c => c.projects)}
            columns={columns}
            onClickProject={(id) => navigate(`/project/${id}`)}
          />
        )}
      </main>

      {showNewJob && (
        <Modal title="Create New Job" onClose={() => setShowNewJob(false)}>
          <NewProjectForm onCreate={handleCreateJob} onCancel={() => setShowNewJob(false)} />
        </Modal>
      )}
    </div>
  )
}
