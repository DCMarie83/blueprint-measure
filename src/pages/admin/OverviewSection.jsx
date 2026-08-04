import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import { useDateFormat } from '../../hooks/useDateFormat'
import styles from './sections.module.css'

export default function OverviewSection() {
  const { companies, users, sessions, loadError } = useAdminData()
  const { formatDateTime } = useDateFormat()
  const { t } = useTranslation()
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
    recentActivity.push({ text: t('admin:overview.companyCreated', { name: c.name }), time: c.created_at })
  })
  sessions.slice(0, 15).forEach(s => {
    recentActivity.push({ text: t('admin:overview.sessionCreated'), time: s.created_at })
  })
  recentActivity.sort((a, b) => new Date(b.time) - new Date(a.time))

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('admin:overview.title')}</h1>

      {loadError && (
        <div className={styles.errorBox}>
          <strong>{t('admin:overview.errorLoading')}</strong> {loadError}
        </div>
      )}

      <div className={styles.metricsBar}>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{companies.length}</div>
          <div className={styles.metricLabel}>{t('admin:overview.totalCompanies')}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{users.length}</div>
          <div className={styles.metricLabel}>{t('admin:overview.totalUsers')}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{sessionsThisMonth}</div>
          <div className={styles.metricLabel}>{t('admin:overview.sessionsThisMonth')}</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{blueprintsUploaded}</div>
          <div className={styles.metricLabel}>{t('admin:overview.blueprintsUploaded')}</div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className={styles.quickStats}>
        <div className={styles.quickStatItem}>
          <span className={styles.quickStatValue}>{pendingInvites}</span>
          <span className={styles.quickStatLabel}>{t('admin:overview.pendingInvitations')}</span>
        </div>
        <Link to="/admin/feedback" className={styles.quickStatItem}>
          <span className={styles.quickStatValue}>{newFeedbackCount}</span>
          <span className={styles.quickStatLabel}>{t('admin:overview.newFeedback')}</span>
        </Link>
        <Link to="/admin/errors" className={styles.quickStatItem}>
          <span className={styles.quickStatValue}>{recentErrorCount}</span>
          <span className={styles.quickStatLabel}>{t('admin:overview.errors24h')}</span>
        </Link>
      </div>

      {/* Activity Feed */}
      {recentActivity.length > 0 && (
        <div className={styles.sectionCard}>
          <h2 className={styles.sectionCardTitle}>{t('admin:overview.recentActivity')}</h2>
          <div className={styles.activityList}>
            {recentActivity.slice(0, 20).map((item, i) => (
              <div key={i} className={styles.activityItem}>
                <span className={styles.activityText}>{item.text}</span>
                <span className={styles.activityTime}>
                  {formatDateTime(item.time)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
