import { useState, useEffect, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import { useDateFormat } from '../../hooks/useDateFormat'
import styles from './sections.module.css'
import { ScrollbarInside } from '../../components/common/FloatingScrollbar'

export default function TestLogsSection() {
  const { t } = useTranslation()
  const { companies, users } = useAdminData()
  const { formatDateTime } = useDateFormat()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [verdictFilter, setVerdictFilter] = useState('ALL')
  const [companyFilter, setCompanyFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('session_test_logs')
        .select('*, sessions(project_name, description)')
        .order('logged_at', { ascending: false })
        .limit(500)
      if (!error) setLogs(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = logs
    .filter(l => verdictFilter === 'ALL' || l.verdict === verdictFilter)
    .filter(l => !companyFilter || l.company_id === companyFilter)

  if (loading) return <div className={styles.empty}>{t('admin:testLogs.loading')}</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>{t('admin:testLogs.title')} <span className={styles.pill}>{logs.length}</span></h1>

      <div className={styles.toolbar}>
        <select className={styles.filterSelect} value={verdictFilter} onChange={e => setVerdictFilter(e.target.value)}>
          <option value="ALL">{t('admin:testLogs.allVerdicts')}</option>
          <option value="PASS">PASS</option>
          <option value="FAIL">FAIL</option>
        </select>
        <select className={styles.filterSelect} value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
          <option value="">{t('admin:testLogs.allCompanies')}</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>{t('admin:testLogs.empty')}</p>
      ) : (
        <div className={styles.tableWrap}><ScrollbarInside />
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>{t('admin:testLogs.colDate')}</th>
                <th className={styles.th}>{t('admin:testLogs.colUser')}</th>
                <th className={styles.th}>{t('admin:testLogs.colSession')}</th>
                <th className={styles.th}>{t('admin:testLogs.colZone')}</th>
                <th className={styles.th}>{t('admin:testLogs.colType')}</th>
                <th className={styles.th}>{t('admin:testLogs.colStated')}</th>
                <th className={styles.th}>{t('admin:testLogs.colMeasured')}</th>
                <th className={styles.th}>{t('admin:testLogs.colVariance')}</th>
                <th className={styles.th}>{t('admin:testLogs.colVerdict')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const userEmail = users.find(u => u.id === log.user_id)?.email ?? '—'
                const sessionLabel = log.sessions ? `${log.sessions.project_name ?? ''}${log.sessions.description ? ' / ' + log.sessions.description : ''}` : '—'
                const stated = log.stated_sf ?? log.stated_lf ?? '—'
                const isExp = expandedId === log.id
                return (
                  <Fragment key={log.id}>
                    <tr className={styles.tr} onClick={() => setExpandedId(isExp ? null : log.id)} style={{ cursor: 'pointer' }}>
                      <td className={styles.td}>{formatDateTime(log.logged_at)}</td>
                      <td className={styles.td}>{userEmail}</td>
                      <td className={styles.td}>{sessionLabel}</td>
                      <td className={styles.td}>{log.zone_name}</td>
                      <td className={styles.td}>{log.measurement_type}</td>
                      <td className={styles.td}>{typeof stated === 'number' ? stated.toFixed(2) : stated}</td>
                      <td className={styles.td}>{log.measured_value?.toFixed(2) ?? '—'}</td>
                      <td className={styles.td}>{log.variance != null ? `${log.variance > 0 ? '+' : ''}${log.variance.toFixed(2)}` : '—'}</td>
                      <td className={styles.td}>
                        <span className={styles.testLogVerdict} style={{
                          color: log.verdict === 'PASS' ? '#22c55e' : '#ef4444',
                          background: log.verdict === 'PASS' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        }}>{log.verdict}</span>
                      </td>
                    </tr>
                    {isExp && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={9} className={styles.expandedCell}>
                          <div className={styles.expandedPanel}>
                            {log.error_message && <div><strong>{t('admin:testLogs.errorLabel')}</strong> {log.error_message}</div>}
                            {log.variance_pct != null && <div>{t('admin:testLogs.variancePct', { pct: log.variance_pct })}</div>}
                            {log.notes && <div><strong>{t('admin:testLogs.notesLabel')}</strong> {log.notes}</div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
