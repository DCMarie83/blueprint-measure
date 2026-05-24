import { useEffect } from 'react'
import { useDateFormat } from '../../hooks/useDateFormat'
import { FEATURE_KEYS, useCompanyPlan } from '../../lib/plans'
import styles from './CompanyDrawer.module.css'

const FEATURES = FEATURE_KEYS

export default function CompanyDrawer({
  company, companyUsers, sessionsThisMonth, sessionsAllTime,
  zonesThisMonth, zonesLoading, onClose,
}) {
  const { formatDate } = useDateFormat()

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const companyPlan = useCompanyPlan(company)

  if (!company) return null

  const flags = company.features ?? {}

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.companyName}>{company.name}</h2>
            <span className={styles.planBadge}>{companyPlan?.display_name ?? company.plan ?? 'Legacy'}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Activity */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Activity</h3>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{sessionsThisMonth}</span>
                <span className={styles.statLabel}>sessions this month</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{sessionsAllTime}</span>
                <span className={styles.statLabel}>sessions all time</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{zonesLoading ? '...' : zonesThisMonth}</span>
                <span className={styles.statLabel}>zones this month</span>
              </div>
            </div>
          </section>

          {/* Users */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Users ({companyUsers.length})</h3>
            {companyUsers.length === 0 ? (
              <p className={styles.emptyText}>No users assigned.</p>
            ) : (
              <table className={styles.usersTable}>
                <thead>
                  <tr>
                    <th className={styles.th}>Email</th>
                    <th className={styles.th}>Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {companyUsers.map(u => (
                    <tr key={u.id}>
                      <td className={styles.td}>{u.email}</td>
                      <td className={styles.td}>
                        {u.last_sign_in_at
                          ? formatDate(u.last_sign_in_at)
                          : <span className={styles.muted}>Never</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Feature Flags */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Feature Flags</h3>
            <div className={styles.flagsList}>
              {FEATURES.map(({ key, label }) => (
                <div key={key} className={styles.flagItem}>
                  <span className={flags[key] ? styles.dotOn : styles.dotOff} />
                  <span className={flags[key] ? styles.flagOn : styles.flagOff}>{label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
