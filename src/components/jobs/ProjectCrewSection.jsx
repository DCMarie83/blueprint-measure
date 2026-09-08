import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, X, Plus } from 'lucide-react'
import { getProjectAssignments, getCrewMembers, assignCrewToProject, removeAssignment } from '../../data/timeTracking'

// Crew assigned to this job (project_assignments). Drives the RivetPay job
// list when the company turns crew_see_all_jobs off.
export default function ProjectCrewSection({ projectId, companyId }) {
  const { t } = useTranslation()
  const [assignments, setAssignments] = useState([])
  const [crew, setCrew] = useState([])
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      const [a, c] = await Promise.all([
        getProjectAssignments(projectId),
        companyId ? getCrewMembers(companyId) : Promise.resolve([]),
      ])
      setAssignments(a)
      setCrew(c)
    } catch { /* section is best-effort */ }
  }, [projectId, companyId])

  useEffect(() => { load() }, [load])

  const assignedIds = new Set(assignments.map(a => a.crew_member_id))
  const available = crew.filter(c => !assignedIds.has(c.id))

  async function handleAssign() {
    if (selected.size === 0) return
    setBusy(true)
    try {
      await assignCrewToProject(projectId, [...selected])
      setSelected(new Set())
      setPicking(false)
      await load()
    } catch (err) { alert(t('time:errors.generic', { error: err.message })) }
    finally { setBusy(false) }
  }

  async function handleRemove(id) {
    try { await removeAssignment(id); await load() }
    catch (err) { alert(t('time:errors.generic', { error: err.message })) }
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps, 0.04em)', color: 'var(--color-text-muted)', margin: 0 }}>
          <Users size={13} /> {t('time:assignments.jobTitle', { count: assignments.length })}
        </h3>
        <button onClick={() => setPicking(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, padding: '4px 12px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-primary)', cursor: 'pointer' }}>
          <Plus size={13} /> {t('time:assignments.assignCrew')}
        </button>
      </div>
      {assignments.length === 0 && !picking && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>{t('time:assignments.jobEmpty')}</p>
      )}
      {assignments.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {assignments.map(a => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 'var(--radius-pill, 9999px)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              {a.crew_members?.name || '—'}
              <button onClick={() => handleRemove(a.id)} title={t('common:action.delete')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, display: 'inline-flex' }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {picking && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
          {available.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>{t('time:assignments.allAssigned')}</p>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {available.map(c => (
                <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(c.id)}
                    onChange={e => setSelected(prev => { const n = new Set(prev); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n })} />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button onClick={() => { setPicking(false); setSelected(new Set()) }} style={{ padding: '5px 12px', fontSize: 12, background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--color-text)' }}>{t('common:action.cancel')}</button>
            <button onClick={handleAssign} disabled={busy || selected.size === 0}
              style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', opacity: (busy || selected.size === 0) ? 0.6 : 1 }}>
              {busy ? '…' : t('time:assignments.assign')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
