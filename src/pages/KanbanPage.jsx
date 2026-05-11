import { Link, useNavigate } from 'react-router-dom'
import Logo from '../components/brand/Logo'
import UserMenu from '../components/UserMenu'
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

export default function KanbanPage() {
  const navigate = useNavigate()
  const { columns, loading, error } = useOpportunities()

  const totalProjects = columns.reduce((sum, col) => sum + col.projects.length, 0)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoWrap}><Logo variant="mark" /></div>
        <UserMenu />
      </header>

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Opportunities</h1>
        <p className={styles.subTitle}>Click any opportunity to open the job. Drag-and-drop coming soon.</p>

        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : error ? (
          <div className={styles.loading} style={{ color: 'var(--color-danger)' }}>{error}</div>
        ) : totalProjects === 0 && columns.length > 0 ? (
          <div className={styles.emptyBoard}>
            <p>No opportunities yet.</p>
            <Link to="/dashboard" className={styles.emptyLink}>Create your first job on the Dashboard →</Link>
          </div>
        ) : (
          <div className={styles.boardContainer}>
            <div className={styles.board}>
              {columns.map(col => (
                <div key={col.id} className={styles.column}>
                  <div className={styles.columnHeader}>
                    <span className={styles.columnName}>{col.name}</span>
                    <span className={styles.columnCount}>{col.projects.length}</span>
                  </div>
                  <div className={styles.cardList}>
                    {col.projects.length === 0 ? (
                      <div className={styles.emptyColumn}>No opportunities here yet</div>
                    ) : (
                      col.projects.map(project => (
                        <div
                          key={project.id}
                          className={styles.card}
                          onClick={() => navigate(`/project/${project.id}`)}
                        >
                          <div className={styles.cardName}>{project.name}</div>
                          {project.address && (
                            <div className={styles.cardAddress}>{project.address}</div>
                          )}
                          <div className={styles.cardMeta}>
                            <span>{project.session_count} blueprint{project.session_count !== 1 ? 's' : ''}</span>
                            <span>Updated {timeAgo(project.updated_at)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
