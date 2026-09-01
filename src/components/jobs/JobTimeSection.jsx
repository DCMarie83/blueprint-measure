import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

// Read-only per-job labor summary: hours grouped by crew member plus a total.
export default function JobTimeSection({ projectId, companyId }) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId || !companyId) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('time_entries')
          .select('id, hours, work_date, crew_member_id, crew_members(name)')
          .eq('company_id', companyId)
          .eq('project_id', projectId)
        if (!cancelled) setEntries(data ?? [])
      } catch { /* section is best-effort */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [projectId, companyId])

  const byCrew = new Map()
  let totalHours = 0
  for (const e of entries) {
    const name = e.crew_members?.name || t('jobs:timeSection.unknownCrew')
    byCrew.set(name, (byCrew.get(name) || 0) + (Number(e.hours) || 0))
    totalHours += Number(e.hours) || 0
  }
  const crewRows = [...byCrew.entries()].sort((a, b) => b[1] - a[1])

  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--color-text-muted)', margin: '0 0 14px' }}>
        {t('jobs:timeSection.title', { hours: totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}
      </h3>
      {loading ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('common:misc.loading')}</p>
      ) : crewRows.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('jobs:timeSection.empty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {crewRows.map(([name, hours]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{name}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)' }}>
                {t('jobs:timeSection.hours', { hours: hours.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
