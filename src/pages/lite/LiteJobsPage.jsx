import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, ChevronRight, Plus } from 'lucide-react'
import NewJobSheet from '../../components/lite/NewJobSheet'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { supabase } from '../../lib/supabase'
import { GC_CLIENT_TYPE, fmtMoney } from '../../lib/lite'
import { EMPTY } from '../../lib/liteVoice'
import styles from './lite.module.css'

// Lite "/jobs" — a flat list (never the kanban). For each job we surface the
// GC it belongs to, when it was last touched, the unbilled amount (entries with
// no invoice yet) and the total ever logged. Money is summed client-side.
export default function LiteJobsPage() {
  const navigate = useNavigate()
  const { companyId } = useEffectiveCompany()
  const { projects, loading: projectsLoading, createProject } = useProjects()
  const { clients } = useClients()
  const [sums, setSums] = useState({}) // projectId -> { total, unbilled }
  const [sumsLoading, setSumsLoading] = useState(true)
  const [showNewJob, setShowNewJob] = useState(false)

  const gcs = useMemo(() => clients.filter(c => c.client_type === GC_CLIENT_TYPE), [clients])

  const gcName = useMemo(() => {
    const map = {}
    for (const c of clients) {
      if (c.client_type === GC_CLIENT_TYPE) map[c.id] = c.business_name || c.display_name
    }
    return map
  }, [clients])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      setSumsLoading(true)
      const { data, error } = await supabase
        .from('work_entries')
        .select('project_id, amount, invoice_id')
        .eq('company_id', companyId)
      if (cancelled) return
      if (!error) {
        const acc = {}
        for (const row of data ?? []) {
          const s = acc[row.project_id] || (acc[row.project_id] = { total: 0, unbilled: 0 })
          const amt = Number(row.amount) || 0
          s.total += amt
          if (!row.invoice_id) s.unbilled += amt
        }
        setSums(acc)
      }
      setSumsLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyId])

  const loading = projectsLoading || sumsLoading

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Jobs</h1>
            <p className={styles.subtitle}>Everything you're logging work against</p>
          </div>
          {!showNewJob && (
            <button className={styles.primaryBtn} onClick={() => setShowNewJob(true)}>
              <Plus size={16} /> New job
            </button>
          )}
        </div>

        {showNewJob && (
          <NewJobSheet
            gcs={gcs}
            createProject={createProject}
            onCreated={proj => navigate(`/log/job/${proj.id}`)}
            onCancel={() => setShowNewJob(false)}
          />
        )}

        {loading ? (
          <div className={styles.loading}>Loading jobs…</div>
        ) : projects.length === 0 ? (
          <div className={styles.empty}>
            <Briefcase size={44} />
            <div className={styles.emptyTitle}>{EMPTY.jobs}</div>
            <p>Start a job from the Daily Log to begin tracking your work and pay.</p>
          </div>
        ) : (
          projects.map(job => {
            const s = sums[job.id] || { total: 0, unbilled: 0 }
            return (
              <button key={job.id} className={styles.listRow} onClick={() => navigate(`/log/job/${job.id}`)}>
                <div className={styles.entryMain}>
                  <div className={styles.listName}>{job.name}</div>
                  <div className={styles.listSub}>
                    {gcName[job.client_id] || 'No GC'}
                    {job.last_activity ? ` · ${new Date(job.last_activity).toLocaleDateString()}` : ''}
                  </div>
                  <div className={styles.listSub}>
                    <span className={styles.moneyDue}>{fmtMoney(s.unbilled)}</span> unbilled · {fmtMoney(s.total)} logged
                  </div>
                </div>
                <ChevronRight size={18} className={styles.muted} />
              </button>
            )
          })
        )}
      </main>
    </div>
  )
}
