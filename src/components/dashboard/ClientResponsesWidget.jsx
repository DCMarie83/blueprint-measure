import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MessageSquare } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'

const RESPONSE_DATES = {
  accepted: 'accepted_at',
  declined: 'declined_at',
  changes_requested: 'changes_requested_at',
}

// Client responses from the last 30 days: accepted, declined, or changes
// requested. Unread (bold, dot) while response_seen_at is null; opening the
// estimate stamps it. Renders nothing when the window is empty.
export default function ClientResponsesWidget() {
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
        const { data } = await supabase
          .from('estimates')
          .select('id, estimate_number, title, status, accepted_at, declined_at, changes_requested_at, decline_reason, change_request_comment, response_seen_at, projects(name)')
          .eq('company_id', companyId)
          .in('status', ['accepted', 'declined', 'changes_requested'])
        if (cancelled) return
        const withDates = (data ?? [])
          .map(e => ({ ...e, respondedAt: e[RESPONSE_DATES[e.status]] || null }))
          .filter(e => e.respondedAt && e.respondedAt >= cutoff)
          .sort((a, b) => (b.respondedAt > a.respondedAt ? 1 : -1))
        setRows(withDates)
      } catch { if (!cancelled) setRows([]) }
    })()
    return () => { cancelled = true }
  }, [companyId])

  if (rows.length === 0) return null

  const color = (s) => s === 'accepted' ? 'var(--color-success, #16a34a)' : s === 'declined' ? 'var(--color-danger, #dc2626)' : '#F27243'

  return (
    <section style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
        <MessageSquare size={16} style={{ color: 'var(--color-primary)' }} /> {t('dashboard:clientResponses.title')}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(e => {
          const unread = !e.response_seen_at
          const detail = e.status === 'declined' ? e.decline_reason : e.status === 'changes_requested' ? e.change_request_comment : null
          return (
            <Link key={e.id} to={`/estimates/${e.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '8px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', textDecoration: 'none', color: 'var(--color-text)' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: unread ? 700 : 500 }}>
                  {unread && <span style={{ width: 7, height: 7, borderRadius: 9999, background: 'var(--color-primary)', flexShrink: 0 }} />}
                  {e.title || e.estimate_number}
                  <span style={{ fontSize: 11, fontWeight: 700, color: color(e.status) }}>{t(`dashboard:clientResponses.status.${e.status}`)}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.projects?.name || ''}{detail ? (e.projects?.name ? ' · ' : '') + detail : ''}
                </span>
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{new Date(e.respondedAt).toLocaleDateString()}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
