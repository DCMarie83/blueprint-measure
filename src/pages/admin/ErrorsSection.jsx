import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import styles from './sections.module.css'

export default function ErrorsSection() {
  const { companies, users } = useAdminData()
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('7d')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('client_errors')
        .select('id, tenant_id, user_id, error_message, stack_trace, component_stack, page_url, created_at')
        .order('created_at', { ascending: false })
        .limit(500)
      if (!error) setErrors(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = errors.filter(ce => {
    if (dateFilter === 'all') return true
    const ago = { '24h': 1, '7d': 7, '30d': 30 }[dateFilter] ?? 7
    return new Date(ce.created_at) > new Date(Date.now() - ago * 86400000)
  })

  if (loading) return <div className={styles.empty}>Loading errors…</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>System Errors <span className={styles.pill}>{errors.length}</span></h1>

      <div className={styles.toolbar}>
        <select className={styles.filterSelect} value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No errors in this time range.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Created</th>
                <th className={styles.th}>User</th>
                <th className={styles.th}>Company</th>
                <th className={styles.th}>Error</th>
                <th className={styles.th}>Page</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ce => {
                const ceUser = users.find(u => u.id === ce.user_id)?.email ?? '—'
                const ceCompany = ce.tenant_id ? companies.find(c => c.id === ce.tenant_id)?.name ?? '—' : '—'
                const isExp = expandedId === ce.id
                return (
                  <Fragment key={ce.id}>
                    <tr className={styles.tr} onClick={() => setExpandedId(isExp ? null : ce.id)} style={{ cursor: 'pointer' }}>
                      <td className={styles.td}>{new Date(ce.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className={styles.td}>{ceUser}</td>
                      <td className={styles.td}>{ceCompany}</td>
                      <td className={styles.td} title={ce.error_message}>{ce.error_message?.length > 60 ? ce.error_message.slice(0, 60) + '…' : ce.error_message}</td>
                      <td className={styles.td} style={{ fontSize: 11 }}>{ce.page_url}</td>
                    </tr>
                    {isExp && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={5} className={styles.expandedCell}>
                          <div className={styles.expandedPanel}>
                            <div><strong>Error:</strong> {ce.error_message}</div>
                            {ce.stack_trace && (
                              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 6, maxHeight: 300, overflow: 'auto' }}>
                                {ce.stack_trace}
                              </pre>
                            )}
                            {ce.component_stack && <div><strong>Component stack:</strong><pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{ce.component_stack}</pre></div>}
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
