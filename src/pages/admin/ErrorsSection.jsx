import { useState, useEffect, useCallback, useContext, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AdminDataContext } from '../../context/AdminDataContext'
import { logError } from '../../lib/logError'
import { useDateFormat } from '../../hooks/useDateFormat'
import styles from './sections.module.css'

const SEVERITY_COLORS = {
  info: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  warning: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  error: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  critical: { bg: 'rgba(220,38,38,0.15)', color: '#dc2626' },
}

function TimezoneBadge({ timezone }) {
  if (!timezone) return <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>-</span>
  // Shorten "Asia/Bangkok" → "Bangkok" for the badge; full value in tooltip.
  const city = timezone.split('/').pop().replace(/_/g, ' ')
  return (
    <span
      title={timezone}
      style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', whiteSpace: 'nowrap' }}
    >
      {city}
    </span>
  )
}

function SeverityBadge({ severity }) {
  const s = SEVERITY_COLORS[severity] || SEVERITY_COLORS.error
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: s.bg, color: s.color, textTransform: 'uppercase' }}>
      {severity}
    </span>
  )
}

// Hook that returns { companies, users, loading } from AdminDataContext when available,
// or fetches directly via RLS-safe queries when mounted outside AdminDataProvider.
function useErrorsContextData() {
  const ctx = useContext(AdminDataContext)
  const [fallbackCompanies, setFallbackCompanies] = useState([])
  const [fallbackUsers, setFallbackUsers] = useState([])
  const [fallbackLoading, setFallbackLoading] = useState(!ctx)

  useEffect(() => {
    if (ctx) return
    async function load() {
      const [{ data: cos }, { data: profs }] = await Promise.all([
        supabase.from('companies').select('id, name'),
        supabase.from('user_profiles').select('user_id, email, full_name'),
      ])
      setFallbackCompanies(cos ?? [])
      // Shape to match AdminDataContext.users (which has .id and .email)
      setFallbackUsers((profs ?? []).map(p => ({ id: p.user_id, email: p.email })))
      setFallbackLoading(false)
    }
    load()
  }, [ctx])

  if (ctx) return { companies: ctx.companies, users: ctx.users, loading: ctx.loading }
  return { companies: fallbackCompanies, users: fallbackUsers, loading: fallbackLoading }
}

// Test error thrower component — throws in useEffect to trigger ErrorBoundary
function BoundaryTestThrower() {
  useEffect(() => {
    throw new Error('Boundary test — triggered manually from admin')
  }, [])
  return null
}

export default function ErrorsSection() {
  const { companies, users, loading: contextLoading } = useErrorsContextData()
  const { formatDateTime, formatTime } = useDateFormat()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialUserIdFilter = searchParams.get('user_id') || 'all'

  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [toast, setToast] = useState(null)
  const [throwBoundaryError, setThrowBoundaryError] = useState(false)

  // Filters
  const [dateFilter, setDateFilter] = useState('7d')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [resolvedFilter, setResolvedFilter] = useState('unresolved')
  const [tenantFilter, setTenantFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [groupByFingerprint, setGroupByFingerprint] = useState(false)
  const [userIdFilter, setUserIdFilter] = useState(initialUserIdFilter)

  // Metrics
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [unresolvedCritical, setUnresolvedCritical] = useState(0)
  const [last24h, setLast24h] = useState(0)

  const loadErrors = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (!error) {
      setErrors(data ?? [])
      const now = Date.now()
      const all = data ?? []
      setUnresolvedCount(all.filter(e => !e.resolved).length)
      setUnresolvedCritical(all.filter(e => !e.resolved && e.severity === 'critical').length)
      setLast24h(all.filter(e => new Date(e.created_at) > new Date(now - 86400000)).length)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadErrors()
  }, [loadErrors])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('client_errors_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'client_errors' }, (payload) => {
        setErrors(prev => [payload.new, ...prev])
        if (!payload.new.resolved) {
          setUnresolvedCount(c => c + 1)
          if (payload.new.severity === 'critical') setUnresolvedCritical(c => c + 1)
        }
        setLast24h(c => c + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'client_errors' }, (payload) => {
        setErrors(prev => {
          const all = prev.map(e => e.id === payload.new.id ? payload.new : e)
          setUnresolvedCount(all.filter(e => !e.resolved).length)
          setUnresolvedCritical(all.filter(e => !e.resolved && e.severity === 'critical').length)
          return all
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const markResolved = async (errorId) => {
    const { data: { session } } = await supabase.auth.getSession()
    // Optimistic update
    setErrors(prev => prev.map(e => e.id === errorId ? { ...e, resolved: true, resolved_at: new Date().toISOString(), resolved_by: session?.user?.id } : e))
    setUnresolvedCount(c => c - 1)

    const { error } = await supabase
      .from('client_errors')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: session?.user?.id })
      .eq('id', errorId)

    if (error) {
      // Revert
      setErrors(prev => prev.map(e => e.id === errorId ? { ...e, resolved: false, resolved_at: null, resolved_by: null } : e))
      setUnresolvedCount(c => c + 1)
    }
  }

  const triggerTestError = (severity) => {
    const testError = new Error(`Test error fired manually at ${new Date().toISOString()}`)
    logError(testError, severity, { source: 'manual_test', triggeredBy: 'super_admin' })
    showToast(`Test error logged with severity: ${severity}. Check errors page to verify.`)
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const clearUserFilter = () => {
    setUserIdFilter('all')
    setSearchParams({})
  }

  // Apply filters
  const filtered = errors.filter(ce => {
    // User ID filter
    if (userIdFilter !== 'all' && ce.user_id !== userIdFilter) return false
    // Date filter
    if (dateFilter !== 'all') {
      const ago = { '24h': 1, '7d': 7, '30d': 30 }[dateFilter] ?? 7
      if (new Date(ce.created_at) <= new Date(Date.now() - ago * 86400000)) return false
    }
    // Severity
    if (severityFilter !== 'all' && ce.severity !== severityFilter) return false
    // Resolved
    if (resolvedFilter === 'unresolved' && ce.resolved) return false
    if (resolvedFilter === 'resolved' && !ce.resolved) return false
    // Tenant
    if (tenantFilter !== 'all' && ce.company_id !== tenantFilter) return false
    // Search
    if (searchText && !ce.error_message?.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })

  // Group by fingerprint
  let displayRows = filtered
  if (groupByFingerprint) {
    const groups = {}
    for (const e of filtered) {
      const fp = e.error_fingerprint || e.id
      if (!groups[fp]) {
        groups[fp] = { ...e, _count: 1 }
      } else {
        groups[fp]._count++
        if (new Date(e.created_at) > new Date(groups[fp].created_at)) {
          groups[fp] = { ...e, _count: groups[fp]._count }
        }
      }
    }
    displayRows = Object.values(groups)
  }

  if (loading || contextLoading) return <div className={styles.empty}>Loading errors...</div>

  if (throwBoundaryError) {
    return <BoundaryTestThrower />
  }

  const userFilterEmail = userIdFilter !== 'all'
    ? users.find(u => u.id === userIdFilter)?.email || userIdFilter.slice(0, 8) + '...'
    : null

  return (
    <div>
      <h1 className={styles.pageTitle}>System Errors</h1>

      {/* User filter chip */}
      {userIdFilter !== 'all' && (
        <div style={{ marginBottom: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, padding: '4px 10px', borderRadius: 12,
            background: 'var(--color-surface, #1e1e2e)', border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}>
            Filtering by user: <strong>{userFilterEmail}</strong>
            <button
              onClick={clearUserFilter}
              style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
              title="Clear user filter"
            >
              &times;
            </button>
          </span>
        </div>
      )}

      {/* Metrics bar */}
      <div className={styles.metricsBar}>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{unresolvedCount}</div>
          <div className={styles.metricLabel}>Total Unresolved</div>
        </div>
        <div className={styles.metricCard} style={unresolvedCritical > 0 ? { borderColor: '#dc2626' } : undefined}>
          <div className={styles.metricValue} style={unresolvedCritical > 0 ? { color: '#dc2626' } : undefined}>{unresolvedCritical}</div>
          <div className={styles.metricLabel}>Unresolved Critical</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{last24h}</div>
          <div className={styles.metricLabel}>Errors (24h)</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{displayRows.length}</div>
          <div className={styles.metricLabel}>Showing</div>
        </div>
      </div>

      {/* Filters toolbar */}
      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search error messages..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
        <select className={styles.filterSelect} value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}>
          <option value="all">All tenants</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={styles.filterSelect} value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
          <option value="all">All severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="critical">Critical</option>
        </select>
        <select className={styles.filterSelect} value={resolvedFilter} onChange={e => setResolvedFilter(e.target.value)}>
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
        <select className={styles.filterSelect} value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={groupByFingerprint} onChange={e => setGroupByFingerprint(e.target.checked)} />
          Group by fingerprint
        </label>
      </div>

      {/* Test buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <TestErrorButton onTrigger={triggerTestError} />
        <button className={styles.secondaryBtn} onClick={() => setThrowBoundaryError(true)} style={{ fontSize: 12 }}>
          Throw real React error
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1e293b', color: '#e2e8f0', padding: '12px 20px', borderRadius: 8, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {/* Table */}
      {displayRows.length === 0 ? (
        <p className={styles.empty}>No errors match current filters.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Severity</th>
                <th className={styles.th}>Message</th>
                {groupByFingerprint && <th className={styles.th}>Count</th>}
                <th className={styles.th}>Tenant</th>
                <th className={styles.th}>User</th>
                <th className={styles.th}>Timezone</th>
                <th className={styles.th}>Page</th>
                <th className={styles.th}>When</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(ce => {
                const ceUser = users.find(u => u.id === ce.user_id)?.email ?? '-'
                const ceCompany = ce.company_id ? companies.find(c => c.id === ce.company_id)?.name ?? '-' : '-'
                const isExp = expandedId === ce.id
                return (
                  <Fragment key={ce.id}>
                    <tr className={styles.tr} onClick={() => setExpandedId(isExp ? null : ce.id)} style={{ cursor: 'pointer' }}>
                      <td className={styles.td}><SeverityBadge severity={ce.severity} /></td>
                      <td className={styles.td} title={ce.error_message}>
                        {ce.error_message?.length > 60 ? ce.error_message.slice(0, 60) + '...' : ce.error_message}
                      </td>
                      {groupByFingerprint && <td className={styles.td} style={{ fontWeight: 700 }}>{ce._count}</td>}
                      <td className={styles.td}>{ceCompany}</td>
                      <td className={styles.td} style={{ fontSize: 11 }}>{ceUser}</td>
                      <td className={styles.td}><TimezoneBadge timezone={ce.timezone} /></td>
                      <td className={styles.td} style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ce.page_url}</td>
                      <td className={styles.td} style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(ce.created_at)}
                      </td>
                      <td className={styles.td}>
                        {!ce.resolved && (
                          <button
                            className={styles.secondaryBtn}
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={(e) => { e.stopPropagation(); markResolved(ce.id) }}
                          >
                            Resolve
                          </button>
                        )}
                        {ce.resolved && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Resolved</span>}
                      </td>
                    </tr>
                    {isExp && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={groupByFingerprint ? 10 : 9} className={styles.expandedCell}>
                          <ErrorDetail error={ce} users={users} formatDateTime={formatDateTime} formatTime={formatTime} />
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

function ErrorDetail({ error: ce, users, formatDateTime, formatTime }) {
  const resolvedByUser = ce.resolved_by ? users.find(u => u.id === ce.resolved_by)?.email : null

  return (
    <div className={styles.expandedPanel}>
      <div><strong>Full message:</strong> {ce.error_message}</div>
      <div><strong>Fingerprint:</strong> <code style={{ fontSize: 11 }}>{ce.error_fingerprint || '-'}</code></div>
      <div><strong>Page URL:</strong> {ce.page_url}</div>
      <div><strong>User Agent:</strong> <span style={{ fontSize: 11 }}>{ce.user_agent || '-'}</span></div>
      <div>
        <strong>Location context:</strong>{' '}
        <span style={{ fontSize: 11 }}>
          {ce.timezone || 'unknown timezone'} · {ce.locale || 'unknown locale'} · viewport {ce.viewport || '-'}
        </span>
      </div>

      {ce.error_stack && (
        <div>
          <strong>Stack trace:</strong>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 6, maxHeight: 250, overflow: 'auto', marginTop: 4 }}>
            {ce.error_stack}
          </pre>
        </div>
      )}

      {ce.component_stack && (
        <div>
          <strong>Component stack:</strong>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 6, maxHeight: 200, overflow: 'auto', marginTop: 4 }}>
            {ce.component_stack}
          </pre>
        </div>
      )}

      {ce.breadcrumbs && ce.breadcrumbs.length > 0 && (
        <div>
          <strong>Breadcrumbs ({ce.breadcrumbs.length}):</strong>
          <div style={{ marginTop: 6, maxHeight: 300, overflow: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8 }}>
            {ce.breadcrumbs.map((b, i) => (
              <BreadcrumbRow key={i} breadcrumb={b} formatTime={formatTime} />
            ))}
          </div>
        </div>
      )}

      {ce.resolved && (
        <div style={{ fontSize: 12, color: '#22c55e' }}>
          Resolved at {formatDateTime(ce.resolved_at)} {resolvedByUser ? `by ${resolvedByUser}` : ''}
        </div>
      )}
    </div>
  )
}

function BreadcrumbRow({ breadcrumb: b, formatTime }) {
  const [expanded, setExpanded] = useState(false)
  const catColors = {
    navigation: '#3b82f6',
    click: '#8b5cf6',
    form: '#f59e0b',
    api: '#06b6d4',
    state: '#22c55e',
    console: '#ef4444',
    custom: '#a855f7',
  }

  return (
    <div style={{ fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap', minWidth: 70 }}>
        {formatTime(b.timestamp)}
      </span>
      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: `${catColors[b.category] || '#666'}22`, color: catColors[b.category] || '#666', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {b.category}
      </span>
      <span style={{ flex: 1 }}>{b.message}</span>
      {b.data && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: 10, background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0 }}
        >
          {expanded ? 'hide' : 'data'}
        </button>
      )}
      {expanded && b.data && (
        <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', margin: 0, color: 'var(--color-text-muted)' }}>
          {JSON.stringify(b.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function TestErrorButton({ onTrigger }) {
  const [severity, setSeverity] = useState('error')
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <select value={severity} onChange={e => setSeverity(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <option value="info">info</option>
        <option value="warning">warning</option>
        <option value="error">error</option>
        <option value="critical">critical</option>
      </select>
      <button className={styles.secondaryBtn} style={{ fontSize: 12 }} onClick={() => onTrigger(severity)}>
        Trigger Test Error
      </button>
    </div>
  )
}
