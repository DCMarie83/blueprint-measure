import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import ClientPicker from '../../components/clients/ClientPicker'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useWorkItems } from '../../hooks/useWorkItems'
import { useWorkEntries } from '../../hooks/useWorkEntries'
import { supabase } from '../../lib/supabase'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { GC_CLIENT_TYPE, unitLabel, fmtMoney } from '../../lib/lite'
import styles from './lite.module.css'

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function LogPage() {
  const { companyId } = useEffectiveCompany()
  const { projects, createProject } = useProjects()
  const { clients, createClient } = useClients()

  const [date, setDate] = useState(todayStr())
  const [projectId, setProjectId] = useState('')
  const [mode, setMode] = useState('piece')
  const [toast, setToast] = useState('')

  // Piece composer
  const [pieceItemId, setPieceItemId] = useState('')
  const [pieceQty, setPieceQty] = useState('')

  // Hourly composer
  const [hours, setHours] = useState('')
  const [hourlyDesc, setHourlyDesc] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')

  // New job
  const [showNewJob, setShowNewJob] = useState(false)
  const [newJobName, setNewJobName] = useState('')
  const [newJobGcId, setNewJobGcId] = useState(null)
  const [creatingJob, setCreatingJob] = useState(false)

  const promptedRef = useRef(new Set())
  const [catalogPrompt, setCatalogPrompt] = useState(null) // gc client id needing setup

  const gcs = clients.filter(c => c.client_type === GC_CLIENT_TYPE)
  const job = projects.find(p => p.id === projectId) || null
  const gcId = job?.client_id || null

  const { items: catalog, loading: catalogLoading } = useWorkItems(gcId)
  const activeItems = useMemo(() => catalog.filter(i => i.is_active), [catalog])
  const { entries, loading: entriesLoading, createEntry, deleteEntry } = useWorkEntries(projectId, { dateFrom: date, dateTo: date })

  const dayTotal = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  // Prefill hourly rate from the sub's last hourly entry for this GC.
  useEffect(() => {
    if (!gcId || !companyId) return
    const gcProjectIds = projects.filter(p => p.client_id === gcId).map(p => p.id)
    if (gcProjectIds.length === 0) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('work_entries')
        .select('rate_snapshot')
        .eq('company_id', companyId)
        .in('project_id', gcProjectIds)
        .eq('entry_type', 'hourly')
        .order('created_at', { ascending: false })
        .limit(1)
      if (cancelled) return
      if (data && data[0]?.rate_snapshot != null) setHourlyRate(String(data[0].rate_snapshot))
    })()
    return () => { cancelled = true }
  }, [gcId, companyId, projects])

  // One-time prompt when a selected job's GC has no catalog items yet.
  useEffect(() => {
    if (!gcId || catalogLoading) { setCatalogPrompt(null); return }
    if (catalog.length === 0 && !promptedRef.current.has(gcId)) {
      promptedRef.current.add(gcId)
      setCatalogPrompt(gcId)
    } else if (catalog.length > 0) {
      setCatalogPrompt(null)
    }
  }, [gcId, catalog.length, catalogLoading])

  const pieceItem = activeItems.find(i => i.id === pieceItemId) || null
  const piecePreview = pieceItem ? (Number(pieceQty) || 0) * (Number(pieceItem.rate) || 0) : 0
  const hourlyPreview = (Number(hours) || 0) * (Number(hourlyRate) || 0)

  async function handleCreateJob() {
    if (!newJobName.trim() || !newJobGcId) return
    setCreatingJob(true)
    try {
      const proj = await createProject({ name: newJobName.trim(), clientId: newJobGcId })
      setProjectId(proj.id)
      setShowNewJob(false)
      setNewJobName('')
      setNewJobGcId(null)
      flash('New job started — go fetch!')
    } catch (err) {
      alert('Failed to create job: ' + err.message)
    } finally {
      setCreatingJob(false)
    }
  }

  async function addPiece() {
    if (!pieceItem || !pieceQty) return
    try {
      await createEntry({
        entry_type: 'piece',
        work_item_id: pieceItem.id,
        unit: pieceItem.unit,
        quantity: Number(pieceQty),
        hours: null,
        rate_snapshot: pieceItem.rate,
        amount: (Number(pieceQty) || 0) * (Number(pieceItem.rate) || 0),
        description: pieceItem.name,
        work_date: date,
      })
      setPieceQty('')
      setPieceItemId('')
      flash('Logged it — good dog!')
    } catch (err) {
      alert('Failed to add entry: ' + err.message)
    }
  }

  async function addHourly() {
    if (!hours || !hourlyRate) return
    try {
      await createEntry({
        entry_type: 'hourly',
        work_item_id: null,
        unit: 'hour',
        quantity: null,
        hours: Number(hours),
        rate_snapshot: Number(hourlyRate),
        amount: (Number(hours) || 0) * (Number(hourlyRate) || 0),
        description: hourlyDesc.trim() || null,
        work_date: date,
      })
      setHours('')
      setHourlyDesc('')
      flash('Logged it — good dog!')
    } catch (err) {
      alert('Failed to add entry: ' + err.message)
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Daily Log</h1>
        </div>

        {toast && <div className={styles.card} style={{ background: 'var(--color-action-open)', color: '#fff', borderColor: 'transparent' }}>{toast}</div>}

        {/* Date + job */}
        <div className={styles.card}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Date</span>
              <input className={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Job</span>
              <select className={styles.select} value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">Select a job…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          {!showNewJob ? (
            <button className={styles.linkBtn} onClick={() => setShowNewJob(true)}>+ New job</button>
          ) : (
            <div className={styles.card} style={{ marginTop: 8, marginBottom: 0 }}>
              <div className={styles.field} style={{ marginBottom: 8 }}>
                <span className={styles.fieldLabel}>Job name</span>
                <input className={styles.input} value={newJobName} onChange={e => setNewJobName(e.target.value)} placeholder="e.g. Maple St unit 4" autoFocus />
              </div>
              <div className={styles.field} style={{ marginBottom: 8 }}>
                <span className={styles.fieldLabel}>General contractor</span>
                <ClientPicker clients={gcs} value={newJobGcId} onChange={setNewJobGcId} placeholder="Search GCs…" />
              </div>
              <div className={styles.rowBetween}>
                <button className={styles.secondaryBtn} onClick={() => { setShowNewJob(false); setNewJobName(''); setNewJobGcId(null) }}>Cancel</button>
                <button className={styles.primaryBtn} disabled={!newJobName.trim() || !newJobGcId || creatingJob} onClick={handleCreateJob}>
                  {creatingJob ? 'Creating…' : 'Create job'}
                </button>
              </div>
            </div>
          )}
        </div>

        {catalogPrompt && (
          <div className={styles.card}>
            This GC has no catalog items yet.{' '}
            <Link to={`/gcs/${catalogPrompt}/catalog`} className={styles.linkBtn} style={{ textDecoration: 'underline' }}>Set up the catalog</Link> to log piece work.
          </div>
        )}

        {/* Composer */}
        {job && (
          <div className={styles.card}>
            <div className={styles.modeToggle}>
              <button className={`${styles.modeBtn} ${mode === 'piece' ? styles.modeBtnActive : ''}`} onClick={() => setMode('piece')}>Piece</button>
              <button className={`${styles.modeBtn} ${mode === 'hourly' ? styles.modeBtnActive : ''}`} onClick={() => setMode('hourly')}>Hourly</button>
            </div>

            {mode === 'piece' ? (
              <>
                <div className={styles.fieldRow}>
                  <div className={styles.field} style={{ flex: '2 1 180px' }}>
                    <span className={styles.fieldLabel}>Item</span>
                    <select className={styles.select} value={pieceItemId} onChange={e => setPieceItemId(e.target.value)}>
                      <option value="">Select item…</option>
                      {activeItems.map(i => <option key={i.id} value={i.id}>{i.name} ({unitLabel(i.unit)})</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Quantity{pieceItem ? ` (${unitLabel(pieceItem.unit)})` : ''}</span>
                    <input className={styles.input} type="number" step="0.01" min="0" value={pieceQty} onChange={e => setPieceQty(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className={styles.rowBetween}>
                  <span className={styles.amountPreview}>{fmtMoney(piecePreview)}</span>
                  <button className={styles.primaryBtn} disabled={!pieceItem || !pieceQty} onClick={addPiece}><Plus size={16} /> Add</button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Hours</span>
                    <input className={styles.input} type="number" step="0.01" min="0" value={hours} onChange={e => setHours(e.target.value)} placeholder="0" />
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Rate ($/hr)</span>
                    <input className={styles.input} type="number" step="0.01" min="0" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <div className={styles.field} style={{ marginBottom: 10 }}>
                  <span className={styles.fieldLabel}>Description (optional)</span>
                  <input className={styles.input} value={hourlyDesc} onChange={e => setHourlyDesc(e.target.value)} placeholder="What did you work on?" />
                </div>
                <div className={styles.rowBetween}>
                  <span className={styles.amountPreview}>{fmtMoney(hourlyPreview)}</span>
                  <button className={styles.primaryBtn} disabled={!hours || !hourlyRate} onClick={addHourly}><Plus size={16} /> Add</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Today's entries */}
        {job && (
          <div className={styles.card}>
            <div className={styles.fieldLabel} style={{ marginBottom: 6 }}>Entries · {date}</div>
            {entriesLoading ? (
              <div className={styles.muted} style={{ padding: '12px 0' }}>Loading…</div>
            ) : entries.length === 0 ? (
              <div className={styles.muted} style={{ padding: '12px 0' }}>No entries yet for this day.</div>
            ) : (
              <>
                {entries.map(e => (
                  <div key={e.id} className={styles.entryRow}>
                    <div className={styles.entryMain}>
                      <div className={styles.entryName}>{e.description || e.work_items?.name || (e.entry_type === 'hourly' ? 'Hourly' : 'Piece work')}</div>
                      <div className={styles.entryMeta}>
                        {e.entry_type === 'hourly'
                          ? `${e.hours} hr × ${fmtMoney(e.rate_snapshot)}`
                          : `${e.quantity} ${unitLabel(e.unit)} × ${fmtMoney(e.rate_snapshot)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={styles.entryAmount}>{fmtMoney(e.amount)}</span>
                      <button className={styles.iconBtn} aria-label="Delete entry" onClick={() => deleteEntry(e.id)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
                <div className={styles.dayTotal}>
                  <span>Day total</span>
                  <span>{fmtMoney(dayTotal)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
