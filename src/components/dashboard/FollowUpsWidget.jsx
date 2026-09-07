import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BellRing } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'

// Jobs with a follow-up due today or overdue, most overdue first. Lost and
// deleted jobs never appear. Renders nothing when the list is empty.
export default function FollowUpsWidget() {
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const { data } = await supabase
          .from('projects')
          .select('id, name, follow_up_at, follow_up_note, clients(display_name)')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .neq('status', 'lost')
          .lte('follow_up_at', today)
          .order('follow_up_at', { ascending: true })
        if (!cancelled) setRows(data ?? [])
      } catch { if (!cancelled) setRows([]) }
    })()
    return () => { cancelled = true }
  }, [companyId])

  if (rows.length === 0) return null

  return (
    <section style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
        <BellRing size={16} style={{ color: '#F27243' }} /> {t('dashboard:followUps.title', { count: rows.length })}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(p => (
          <Link key={p.id} to={`/project/${p.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '8px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', textDecoration: 'none', color: 'var(--color-text)' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.clients?.display_name || ''}{p.follow_up_note ? (p.clients?.display_name ? ' · ' : '') + p.follow_up_note : ''}
              </span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--color-danger, #dc2626)' }}>
              {new Date(p.follow_up_at + 'T00:00:00').toLocaleDateString()}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
