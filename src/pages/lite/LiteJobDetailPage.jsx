import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Trash2, Check, X, Pencil } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useWorkEntries } from '../../hooks/useWorkEntries'
import { GC_CLIENT_TYPE, unitLabel, fmtMoney } from '../../lib/lite'
import styles from './lite.module.css'

// Single-job rollup + entry ledger for Lite. The four stat cards summarise the
// whole job (ignoring the date filter); the table below is date-filterable and
// each row can be edited or deleted inline. "Create invoice" is intentionally
// disabled — invoicing is wired in a later stage.
export default function LiteJobDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { projects, loading: projectsLoading } = useProjects()
  const { clients } = useClients()
  const { entries, loading: entriesLoading, updateEntry, deleteEntry } = useWorkEntries(id)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editId, setEditId] = useState(null)
  const [editCount, setEditCount] = useState('') // quantity for piece, hours for hourly
  const [editRate, setEditRate] = useState('')

  const job = projects.find(p => p.id === id) || null
  const gc = clients.find(c => c.id === job?.client_id && c.client_type === GC_CLIENT_TYPE) || null
  const gcName = gc ? (gc.business_name || gc.display_name) : 'No GC'

  const rollup = useMemo(() => {
    let total = 0, unbilled = 0, invoiced = 0
    for (const e of entries) {
      const amt = Number(e.amount) || 0
      total += amt
      if (e.invoice_id) invoiced += amt
      else unbilled += amt
    }
    return { total, unbilled, invoiced }
  }, [entries])

  const visible = useMemo(() => {
    return entries.filter(e => {
      if (dateFrom && e.work_date < dateFrom) return false
      if (dateTo && e.work_date > dateTo) return false
      return true
    })
  }, [entries, dateFrom, dateTo])

  function startEdit(e) {
    setEditId(e.id)
    setEditCount(String((e.entry_type === 'hourly' ? e.hours : e.quantity) ?? ''))
    setEditRate(String(e.rate_snapshot ?? ''))
  }
  function cancelEdit() { setEditId(null); setEditCount(''); setEditRate('') }

  async function saveEdit(e) {
    const count = Number(editCount) || 0
    const rate = Number(editRate) || 0
    const fields = e.entry_type === 'hourly'
      ? { hours: count, quantity: null, rate_snapshot: rate, amount: count * rate }
      : { quantity: count, hours: null, rate_snapshot: rate, amount: count * rate }
    try {
      await updateEntry(e.id, fields)
      cancelEdit()
    } catch (err) {
      alert('Failed to save entry: ' + err.message)
    }
  }

  const loading = projectsLoading || entriesLoading

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <button className={styles.backLink} onClick={() => navigate('/jobs')}><ChevronLeft size={15} /> Jobs</button>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{job?.name || 'Job'}</h1>
            <p className={styles.subtitle}>{gcName}</p>
          </div>
          <span className={styles.tooltipWrap} title="Invoicing lands next">
            <button className={styles.primaryBtn} disabled>Create invoice</button>
          </span>
        </div>

        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total logged</div>
            <div className={styles.statValue}>{fmtMoney(rollup.total)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Anticipated pay</div>
            <div className={styles.statValue}>{fmtMoney(rollup.total)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Unbilled</div>
            <div className={styles.statValue}>{fmtMoney(rollup.unbilled)}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Invoiced</div>
            <div className={styles.statValue}>{fmtMoney(rollup.invoiced)}</div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.fieldRow} style={{ marginBottom: 4 }}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>From</span>
              <input className={styles.input} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>To</span>
              <input className={styles.input} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button className={styles.linkBtn} onClick={() => { setDateFrom(''); setDateTo('') }}>Clear dates</button>
          )}
        </div>

        <div className={styles.card}>
          {loading ? (
            <div className={styles.muted} style={{ padding: '12px 0' }}>Loading entries…</div>
          ) : visible.length === 0 ? (
            <div className={styles.muted} style={{ padding: '12px 0' }}>No entries in this range.</div>
          ) : (
            visible.map(e => (
              <div key={e.id} className={styles.entryRow}>
                <div className={styles.entryMain}>
                  <div className={styles.entryName}>{e.description || e.work_items?.name || (e.entry_type === 'hourly' ? 'Hourly' : 'Piece work')}</div>
                  {editId === e.id ? (
                    <div className={styles.fieldRow} style={{ marginTop: 6, marginBottom: 0 }}>
                      <input className={styles.input} style={{ width: 90 }} type="number" step="0.01" min="0" value={editCount} onChange={ev => setEditCount(ev.target.value)} aria-label={e.entry_type === 'hourly' ? 'Hours' : 'Quantity'} />
                      <input className={styles.input} style={{ width: 90 }} type="number" step="0.01" min="0" value={editRate} onChange={ev => setEditRate(ev.target.value)} aria-label="Rate" />
                    </div>
                  ) : (
                    <div className={styles.entryMeta}>
                      {new Date(e.work_date + 'T00:00:00').toLocaleDateString()} · {e.entry_type === 'hourly'
                        ? `${e.hours} hr × ${fmtMoney(e.rate_snapshot)}`
                        : `${e.quantity} ${unitLabel(e.unit)} × ${fmtMoney(e.rate_snapshot)}`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {editId === e.id ? (
                    <>
                      <span className={styles.entryAmount}>{fmtMoney((Number(editCount) || 0) * (Number(editRate) || 0))}</span>
                      <button className={styles.iconBtn} aria-label="Save" onClick={() => saveEdit(e)}><Check size={16} /></button>
                      <button className={styles.iconBtn} aria-label="Cancel" onClick={cancelEdit}><X size={16} /></button>
                    </>
                  ) : (
                    <>
                      <span className={styles.entryAmount}>{fmtMoney(e.amount)}</span>
                      <button className={styles.iconBtn} aria-label="Edit entry" onClick={() => startEdit(e)}><Pencil size={16} /></button>
                      <button className={styles.iconBtn} aria-label="Delete entry" onClick={() => { if (window.confirm('Delete this entry?')) deleteEntry(e.id) }}><Trash2 size={16} /></button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  )
}
