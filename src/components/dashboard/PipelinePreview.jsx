import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { resolveColumnLabel } from '../../lib/kanbanColumnLabel'
import styles from './PipelinePreview.module.css'

export default function PipelinePreview({ pipeline, hasZeroJobs }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (hasZeroJobs) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>{t('dashboard:pipeline.title')}</span>
          <Link to="/jobs" className={styles.boardLink}>{t('dashboard:pipeline.seeBoard')}</Link>
        </div>
        <div className={styles.empty}>
          {t('dashboard:pipeline.empty')}
        </div>
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>{t('dashboard:pipeline.title')}</span>
        <Link to="/jobs" className={styles.boardLink}>{t('dashboard:pipeline.seeBoard')}</Link>
      </div>

      <div className={styles.columns}>
        {(pipeline ?? []).map(col => {
          const visible = col.projects.slice(0, 2)
          const remaining = col.count - visible.length

          return (
            <div key={col.id} className={styles.col}>
              <div className={styles.colHeader}>
                <span className={styles.colName}>{resolveColumnLabel(t, col)}</span>
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
                    {t('dashboard:pipeline.blueprintCount', { count: item.session_count ?? 0 })}
                  </div>
                </div>
              ))}

              {visible.length === 0 && (
                <div className={styles.more} style={{ opacity: 0.5 }}>{t('dashboard:pipeline.columnEmpty')}</div>
              )}

              {remaining > 0 && (
                <div className={styles.more}>{t('dashboard:pipeline.more', { count: remaining })}</div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
