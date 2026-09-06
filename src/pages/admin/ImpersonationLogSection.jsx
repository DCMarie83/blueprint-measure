import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import styles from './sections.module.css'
import { ScrollbarInside } from '../../components/common/FloatingScrollbar'

export default function ImpersonationLogSection() {
  const { t } = useTranslation()
  const { companies } = useAdminData()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('impersonation_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50)
      setSessions(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const companyName = (id) => companies?.find(c => c.id === id)?.name || id?.slice(0, 8) || '—'

  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  if (loading) return <div className={styles.empty}>{t('admin:impersonation.loading')}</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('admin:impersonation.logTitle')}</h1>

      {sessions.length === 0 ? (
        <div className={styles.empty}>{t('admin:impersonation.noSessions')}</div>
      ) : (
        <div className={styles.tableWrap}><ScrollbarInside />
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>{t('admin:impersonation.colCompany')}</th>
                <th className={styles.th}>{t('admin:impersonation.colStarted')}</th>
                <th className={styles.th}>{t('admin:impersonation.colEnded')}</th>
                <th className={styles.th}>{t('admin:impersonation.colNotes')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className={styles.tr}>
                  <td className={styles.td} style={{ fontWeight: 600 }}>{companyName(s.target_company_id)}</td>
                  <td className={styles.td}>{fmtDate(s.started_at)}</td>
                  <td className={styles.td}>{s.ended_at ? fmtDate(s.ended_at) : <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{t('admin:impersonation.active')}</span>}</td>
                  <td className={styles.td} style={{ color: 'var(--color-text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
