import { ChevronRight } from 'lucide-react'
import { useClients } from '../../hooks/useClients'
import { timeAgo } from '../../utils/timeAgo'
import styles from './JobsListView.module.css'

const DOT_COLORS = [
  'var(--color-primary)',
  '#10b981',
  '#60a5fa',
  '#a78bfa',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
]

export default function JobsListView({ projects, columns, onClickProject }) {
  const { clients } = useClients()

  const colMap = Object.fromEntries((columns ?? []).map(c => [c.id, c]))

  const allProjects = (columns ?? []).flatMap(col => col.projects.map(p => ({ ...p, _colName: col.name, _colPos: col.position })))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

  if (allProjects.length === 0) return null

  return (
    <div className={styles.list}>
      {allProjects.map(project => {
        const col = colMap[project.kanban_column_id]
        const colName = col?.name ?? project._colName ?? '—'
        const colPos = col?.position ?? project._colPos ?? 0
        const dotColor = DOT_COLORS[(colPos - 1) % DOT_COLORS.length]

        const linkedClient = project.client_id ? clients.find(c => c.id === project.client_id) : null
        const clientLabel = linkedClient?.display_name || project.client_name || null

        return (
          <div key={project.id} className={styles.row} onClick={() => onClickProject(project.id)}>
            <span className={styles.dot} style={{ background: dotColor }} />
            <div className={styles.identity}>
              <h3 className={styles.name}>{project.name}</h3>
              <span className={styles.client}>
                {clientLabel || <span className={styles.unlinked}>— Unlinked</span>}
                {project.address && <> · {project.address}</>}
              </span>
            </div>
            <span className={styles.statusPill}>{colName}</span>
            <span className={styles.updated}>Updated {timeAgo(project.updated_at)}</span>
            <span className={styles.chevron}><ChevronRight size={16} /></span>
          </div>
        )
      })}
    </div>
  )
}
