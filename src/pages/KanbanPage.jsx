import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, useDroppable,
  useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor,
  closestCenter,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AppHeader from '../components/AppHeader'
import { useOpportunities } from '../hooks/useOpportunities'
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function SortableJobCard({ project, columnId }) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    data: { columnId, project },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={styles.card}
      onClick={() => !isDragging && navigate(`/project/${project.id}`)}
    >
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
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { columnId: column.id },
  })

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
          ) : (
            column.projects.map(p => (
              <SortableJobCard key={p.id} project={p} columnId={column.id} />
            ))
          )}
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function KanbanPage() {
  const { columns, loading, error, moveProject } = useOpportunities()
  const [activeId, setActiveId] = useState(null)

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
    if (result?.error) {
      alert('Could not move card: ' + result.error)
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader />

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Jobs</h1>
        <p className={styles.subTitle}>Click any job to open it. Drag between columns to update status.</p>

        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : error ? (
          <div className={styles.loading} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : totalProjects === 0 && columns.length > 0 ? (
          <div className={styles.emptyBoard}>
            <p>No jobs yet.</p>
            <Link to="/dashboard" className={styles.emptyLink}>Create your first job on the Dashboard →</Link>
          </div>
        ) : (
          <div className={styles.boardContainer}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(e) => setActiveId(e.active.id)}
              onDragCancel={() => setActiveId(null)}
              onDragEnd={handleDragEnd}
            >
              <div className={styles.board}>
                {columns.map(col => (
                  <DroppableColumn key={col.id} column={col} />
                ))}
              </div>
              <DragOverlay>
                {activeProject ? <DragCardDisplay project={activeProject} /> : null}
              </DragOverlay>
            </DndContext>
          </div>
        )}
      </main>
    </div>
  )
}
