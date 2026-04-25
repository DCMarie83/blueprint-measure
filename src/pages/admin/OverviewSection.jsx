import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import styles from './sections.module.css'

export default function OverviewSection() {
  const { companies, users, sessions, loadError } = useAdminData()
  const [newFeedbackCount, setNewFeedbackCount] = useState(0)
  const [recentErrorCount, setRecentErrorCount] = useState(0)

  const now = new Date()
  const sessionsThisMonth = sessions.filter(s => {
    const d = new Date(s.created_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
  const blueprintsUploaded = sessions.filter(s => !!s.blueprint_url).length
  const pendingInvites = users.filter(u => !u.last_sign_in_at).length

  useEffect(() => {
    supabase.from('beta_feedback').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count }) => setNewFeedbackCount(count ?? 0))
    const cutoff = new Date(Date.now() - 86400000).toISOString()
    supabase.from('client_errors').select('id', { count: 'exact', head: true }).gte('created_at', cutoff)
      .then(({ count }) => setRecentErrorCount(count ?? 0))
  }, [])

  // Recent activity — last 20 events across tables
  const recentActivity = []
  companies.slice(-10).reverse().forEach(c => {
    recentActivity.push({ text: `Company "${c.name}" created`, time: c.created_at })
  })
  sessions.slice(0, 15).forEach(s => {
    recentActivity.push({ text: `Session created`, time: s.created_at })
  })
  recentActivity.sort((a, b) => new Date(b.time) - new Date(a.time))

  return (
    <div>
      <h1 className={styles.pageTitle}>Overview</h1>

      {loadError && (
        <div className={styles.errorBox}>
          <strong>Error loading data:</strong> {loadError}
        </div>
      )}

      <div className={styles.metricsBar}>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{companies.length}</div>
          <div className={styles.metricLabel}>Total Companies</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{users.length}</div>
          <div className={styles.metricLabel}>Total Users</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{sessionsThisMonth}</div>
          <div className={styles.metricLabel}>Sessions This Month</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{blueprintsUploaded}</div>
          <div className={styles.metricLabel}>Blueprints Uploaded</div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className={styles.quickStats}>
        <div className={styles.quickStatItem}>
          <span className={styles.quickStatValue}>{pendingInvites}</span>
          <span className={styles.quickStatLabel}>Pending Invitations</span>
        </div>
        <Link to="/admin/feedback" className={styles.quickStatItem}>
          <span className={styles.quickStatValue}>{newFeedbackCount}</span>
          <span className={styles.quickStatLabel}>New Feedback</span>
        </Link>
        <Link to="/admin/errors" className={styles.quickStatItem}>
          <span className={styles.quickStatValue}>{recentErrorCount}</span>
          <span className={styles.quickStatLabel}>Errors (24h)</span>
        </Link>
      </div>

      {/* Activity Feed */}
      {recentActivity.length > 0 && (
        <div className={styles.sectionCard}>
          <h2 className={styles.sectionCardTitle}>Recent Platform Activity</h2>
          <div className={styles.activityList}>
            {recentActivity.slice(0, 20).map((item, i) => (
              <div key={i} className={styles.activityItem}>
                <span className={styles.activityText}>{item.text}</span>
                <span className={styles.activityTime}>
                  {new Date(item.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
