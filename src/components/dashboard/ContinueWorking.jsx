import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useImpersonation } from '../../context/ImpersonationContext'
import { supabase } from '../../lib/supabase'
import { logError } from '../../lib/logError'
import styles from './ContinueWorking.module.css'

export default function ContinueWorking() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const { isImpersonating } = useImpersonation()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    if (isImpersonating && !companyId) return
    let cancelled = false

    async function load() {
      try {
        let query = supabase
          .from('sessions')
          .select('id, description, updated_at, project_id, projects(name)')

        if (isImpersonating) {
          query = query.eq('company_id', companyId)
        } else {
          query = query.eq('user_id', user.id)
        }

        const { data, error } = await query
          .order('updated_at', { ascending: false })
          .limit(5)

        if (error) throw error
        if (!cancelled) setSessions(data ?? [])
      } catch (err) {
        logError(err, 'warning', { component: 'ContinueWorking' })
        if (!cancelled) setSessions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user, isImpersonating, companyId])

  if (loading || sessions.length === 0) return null

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t('dashboard:continueWorking.title')}</h2>
      <div className={styles.grid}>
        {sessions.map((s) => (
          <button
            key={s.id}
            className={styles.card}
            onClick={() => navigate(`/session/${s.id}`)}
            title={s.projects?.name || t('dashboard:continueWorking.untitled')}
          >
            <div className={styles.projectName}>{s.projects?.name || t('dashboard:continueWorking.untitled')}</div>
            {s.description && <div className={styles.description}>{s.description}</div>}
            <div className={styles.timestamp}>{formatRelative(s.updated_at, t)}</div>
          </button>
        ))}
      </div>
    </section>
  )
}

function formatRelative(timestamp, t) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return t('dashboard:time.justNow')
  if (diffMin < 60) return t('dashboard:time.minsAgo', { count: diffMin })
  if (diffHr < 24) return t('dashboard:time.hoursAgo', { count: diffHr })
  if (diffDay === 1) return t('dashboard:time.yesterday')
  if (diffDay < 7) return t('dashboard:time.daysAgo', { count: diffDay })
  if (diffDay < 30) return t('dashboard:time.weeksAgo', { count: Math.floor(diffDay / 7) })
  return date.toLocaleDateString()
}
