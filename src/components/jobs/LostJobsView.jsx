import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { ScrollbarInside } from '../common/FloatingScrollbar'
import styles from './JobsListView.module.css'

// Mark a job lost: status only — the card keeps its column for a later
// reopen, the follow-up date clears, and the reason (when given) lands in
// follow_up_note prefixed "Lost: " (no dedicated lost-reason column exists).
// The activity row requires 'job_lost' in the client_activity check.
export async function markProjectLost(sb, { projectId, clientId, companyId, reason }) {
  const patch = { status: 'lost', follow_up_at: null, updated_at: new Date().toISOString() }
  const trimmed = (reason || '').trim()
  if (trimmed) patch.follow_up_note = `Lost: ${trimmed}`
  const { error } = await sb.from('projects').update(patch).eq('id', projectId)
  if (error) throw new Error(error.message)
  if (clientId && companyId) {
    try {
      await sb.from('client_activity').insert({
        client_id: clientId, company_id: companyId,
        activity_type: 'job_lost', title: 'Job marked lost',
        body: trimmed || null, is_automated: true,
        metadata: { project_id: projectId },
      })
    } catch { /* activity trail is best-effort */ }
  }
}

function fmtMoney(v) {
  return `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// The last quote is the newest estimate's resolved total: the same variant
// resolution the PDF and email use (accepted > selected > good).
function resolveQuote(est) {
  if (!est) return null
  const v = est.accepted_variant || est.selected_variant || 'good'
  return Number(est[`${v}_total`]) || Number(est.good_total) || 0
}

export default function LostJobsView({ companyId, refreshBoard }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [reopening, setReopening] = useState(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('id, name, client_id, updated_at, follow_up_note, clients(display_name)')
        .eq('company_id', companyId)
        .eq('status', 'lost')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (error) throw error
      const ids = (projects ?? []).map(p => p.id)
      let quoteByProject = {}
      if (ids.length > 0) {
        const { data: ests } = await supabase
          .from('estimates')
          .select('project_id, created_at, accepted_variant, selected_variant, good_total, better_total, best_total')
          .in('project_id', ids)
          .order('created_at', { ascending: false })
        for (const est of (ests ?? [])) {
          if (!(est.project_id in quoteByProject)) quoteByProject[est.project_id] = resolveQuote(est)
        }
      }
      setRows((projects ?? []).map(p => ({
        ...p,
        quote: quoteByProject[p.id] ?? null,
        reason: (p.follow_up_note || '').startsWith('Lost: ') ? p.follow_up_note.slice(6) : '',
      })))
    } catch { setRows([]) }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { load() }, [load])

  async function handleReopen(projectId) {
    setReopening(projectId)
    try {
      const { data: declinedCol, error: colErr } = await supabase
        .from('kanban_columns')
        .select('id, status_key')
        .eq('company_id', companyId)
        .eq('column_key', 'declined')
        .maybeSingle()
      if (colErr) throw colErr
      const followUp = new Date()
      followUp.setDate(followUp.getDate() + 7)
      const patch = {
        status: declinedCol?.status_key || 'declined',
        follow_up_at: followUp.toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      }
      if (declinedCol?.id) patch.kanban_column_id = declinedCol.id
      const { error } = await supabase.from('projects').update(patch).eq('id', projectId)
      if (error) throw error
      await load()
      refreshBoard?.()
    } catch (err) {
      alert(t('jobs:lost.reopenFailed', { error: err.message || t('common:misc.unknownError') }))
    } finally {
      setReopening(null)
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>{t('common:misc.loading')}</div>
  if (rows.length === 0) return <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>{t('jobs:lost.empty')}</div>

  return (
    <div className={styles.tableWrap} style={{ overflowX: 'auto' }}><ScrollbarInside />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {['job', 'client', 'lastQuote', 'lostDate', 'reason', ''].map((k, i) => (
              <th key={i} style={{ textAlign: k === 'lastQuote' ? 'right' : 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps, 0.04em)', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                {k ? t(`jobs:lost.col.${k}`) : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                <Link to={`/project/${p.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>{p.name}</Link>
              </td>
              <td style={{ padding: '10px 12px' }}>{p.clients?.display_name || '—'}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.quote != null && p.quote > 0 ? fmtMoney(p.quote) : '—'}</td>
              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{new Date(p.updated_at).toLocaleDateString()}</td>
              <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>{p.reason || '—'}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                <button
                  onClick={() => handleReopen(p.id)}
                  disabled={reopening === p.id}
                  style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-primary)', cursor: 'pointer' }}
                >{reopening === p.id ? '…' : t('jobs:lost.reopen')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
