import { useNavigate, Link } from 'react-router-dom'
import styles from './PipelinePreview.module.css'

export default function PipelinePreview({ pipeline, hasZeroJobs }) {
  const navigate = useNavigate()

  if (hasZeroJobs) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Pipeline</span>
          <Link to="/opportunities" className={styles.boardLink}>See full board &rarr;</Link>
        </div>
        <div className={styles.empty}>
          No opportunities yet. Create your first job to get started.
        </div>
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Pipeline</span>
        <Link to="/opportunities" className={styles.boardLink}>See full board &rarr;</Link>
      </div>

      <div className={styles.columns}>
        {(pipeline ?? []).map(col => {
          const visible = col.projects.slice(0, 2)
          const remaining = col.count - visible.length

          return (
            <div key={col.id} className={styles.col}>
              <div className={styles.colHeader}>
                <span className={styles.colName}>{col.name}</span>
                <span className={styles.colCount}>{col.count}</span>
              </div>

              {visible.map(item => (
                <div
                  key={item.id}
                  className={styles.miniCard}
                  onClick={() => navigate(`/project/${item.id}`)}
                >
                  <div className={styles.miniName}>{item.name}</div>
                  <div className={styles.miniMeta}>
                    {item.session_count ?? 0} blueprint{(item.session_count ?? 0) !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}

              {visible.length === 0 && (
                <div className={styles.more} style={{ opacity: 0.5 }}>Empty</div>
              )}

              {remaining > 0 && (
                <div className={styles.more}>+ {remaining} more</div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
