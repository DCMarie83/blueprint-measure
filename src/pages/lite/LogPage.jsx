import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import NewJobSheet from '../../components/lite/NewJobSheet'
import WorkItemSearch from '../../components/lite/WorkItemSearch'
import { useProjects } from '../../hooks/useProjects'
import { useClients } from '../../hooks/useClients'
import { useWorkItems } from '../../hooks/useWorkItems'
import { useWorkEntries } from '../../hooks/useWorkEntries'
import { supabase } from '../../lib/supabase'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { GC_CLIENT_TYPE, LITE_UNITS, unitLabel, fmtMoney } from '../../lib/lite'
import { TOASTS, DONE_CLOSER } from '../../lib/liteVoice'
import styles from './lite.module.css'

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function LogPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialJob = searchParams.get('job')
  const { companyId, company } = useEffectiveCompany()
  const { projects, createProject } = useProjects()
  const { clients, createClient } = useClients()

  const [date, setDate] = useState(todayStr())
  const [projectId, setProjectId] = useState(initialJob || '')
  const [mode, setMode] = useState('piece')
  const [toast, setToast] = useState('')

  // Piece composer — type-ahead (WorkItemSearch) over the GC catalog + library.
  const [pick, setPick] = useState(null) // null | {type:'catalog',item} | {type:'library',row} | {type:'custom',name}
  const [inlineRate, setInlineRate] = useState('')
  const [customUnit, setCustomUnit] = useState('each')
  const [pieceQty, setPieceQty] = useState('')
  const [library, setLibrary] = useState([])
  const qtyRef = useRef(null)
  const searchRef = useRef(null)
  const didFocusRef = useRef(false)

  // Hourly composer — same type-ahead, hour-appropriate: catalog pick locks the
  // saved rate; library pick asks a rate then two-inserts; the custom pick keeps
  // the typed text as a plain free-text description (no catalog item).
  const [hourlyPick, setHourlyPick] = useState(null) // null | {type:'catalog',item} | {type:'library',row} | {type:'custom',text}
  const [hours, setHours] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const hoursRef = useRef(null)

  // New job
  const [showNewJob, setShowNewJob] = useState(false)

  // "Done for today" summary sheet — purely presentational, writes nothing.
  const [doneSheet, setDoneSheet] = useState(null) // null | { count, total, otherAmount, otherJobs }

  const promptedRef = useRef(new Set())
  const [catalogPrompt, setCatalogPrompt] = useState(null) // gc client id needing setup

  const gcs = clients.filter(c => c.client_type === GC_CLIENT_TYPE)
  const job = projects.find(p => p.id === projectId) || null
  const gcId = job?.client_id || null

  const { items: catalog, loading: catalogLoading, createItem, createFromLibrary } = useWorkItems(gcId)
  const { entries, loading: entriesLoading, createEntry, deleteEntry } = useWorkEntries(projectId, { dateFrom: date, dateTo: date })

  const dayTotal = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  // Library fetched once per trade vertical and cached for the session (≈95
  // rows), then filtered client-side per keystroke — no per-keystroke query.
  const tradeVertical = company?.trade_vertical
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const verticals = tradeVertical ? [tradeVertical, 'common'] : ['common']
      const { data } = await supabase
        .from('work_item_library')
        .select('*')
        .eq('is_active', true)
        .in('trade_vertical', verticals)
        .order('name', { ascending: true })
      if (!cancelled) setLibrary(data ?? [])
    })()
    return () => { cancelled = true }
  }, [tradeVertical])

  // Reset both composers' selections when the job (and thus GC catalog) changes.
  useEffect(() => {
    setPick(null); setInlineRate(''); setPieceQty(''); setCustomUnit('each')
    setHourlyPick(null); setHours('')
  }, [projectId])

  // Arriving from a job detail (/log?job=<id>): once that job resolves, focus the
  // piece composer's search box so the sub can start logging immediately. Guarded
  // to fire only once so it never steals focus during normal use.
  useEffect(() => {
    if (initialJob && job && !didFocusRef.current) {
      didFocusRef.current = true
      searchRef.current?.focus()
    }
  }, [initialJob, job])

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

  const isCatalogPick = pick?.type === 'catalog'
  const isLibraryPick = pick?.type === 'library'
  const isCustomPick = pick?.type === 'custom'
  const inlineNeedsRate = isLibraryPick || isCustomPick
  const pickUnit = isCatalogPick ? pick.item.unit : isLibraryPick ? pick.row.unit : isCustomPick ? customUnit : null
  const effRate = isCatalogPick ? (Number(pick.item.rate) || 0) : (Number(inlineRate) || 0)
  const piecePreview = (Number(pieceQty) || 0) * effRate
  // Rate 0 is barred ONLY on the inline-create path (it freezes into money
  // history). A catalog item's saved $0 rate is still allowed through.
  const rateOk = !inlineNeedsRate || Number(inlineRate) > 0
  const qtyOk = Number(pieceQty) > 0
  const canAddPiece = !!pick && qtyOk && rateOk && (!isCustomPick || !!pick.name.trim())

  // Hourly derived — mirrors piece. Catalog rate is locked; library asks a rate
  // (>0, it freezes into the catalog); custom keeps the prefilled/typed rate.
  const isHCatalog = hourlyPick?.type === 'catalog'
  const isHLibrary = hourlyPick?.type === 'library'
  const isHCustom = hourlyPick?.type === 'custom'
  const hourlyName = isHCatalog ? hourlyPick.item.name : isHLibrary ? hourlyPick.row.name : isHCustom ? hourlyPick.text : ''
  const hEffRate = isHCatalog ? (Number(hourlyPick.item.rate) || 0) : (Number(hourlyRate) || 0)
  const hourlyPreview = (Number(hours) || 0) * hEffRate
  const hRateOk = isHLibrary ? Number(hourlyRate) > 0 : !!hourlyRate
  const canAddHourly = !!hourlyPick && Number(hours) > 0 && hRateOk

  function pickCatalog(item) {
    setPick({ type: 'catalog', item }); setPieceQty('')
    setTimeout(() => qtyRef.current?.focus(), 0)
  }
  function pickLibrary(row) { setPick({ type: 'library', row }); setInlineRate(''); setPieceQty('') }
  function pickCustom(name) { setPick({ type: 'custom', name }); setCustomUnit('each'); setInlineRate(''); setPieceQty('') }
  function resetComposer() {
    setPick(null); setInlineRate(''); setPieceQty(''); setCustomUnit('each')
  }

  // Hourly pick handlers. Catalog locks the saved rate and jumps to hours;
  // library clears the rate to force an entry; custom keeps the prefilled rate.
  function pickHourlyCatalog(item) {
    setHourlyPick({ type: 'catalog', item }); setHourlyRate(String(item.rate ?? '')); setHours('')
    setTimeout(() => hoursRef.current?.focus(), 0)
  }
  function pickHourlyLibrary(row) { setHourlyPick({ type: 'library', row }); setHourlyRate(''); setHours('') }
  function pickHourlyCustom(text) { setHourlyPick({ type: 'custom', text }); setHours('') }
  function resetHourly() { setHourlyPick(null); setHours('') }

  function handleJobCreated(proj) {
    setProjectId(proj.id)
    setShowNewJob(false)
    flash(TOASTS.jobCreated)
  }

  // Open the day-summary sheet. Reads only — the entries are already saved on
  // Add. One extra company-scoped read tallies same-date entries on OTHER jobs.
  async function openDoneSheet() {
    const base = { count: entries.length, total: dayTotal, otherAmount: 0, otherJobs: 0 }
    if (!companyId) { setDoneSheet(base); return }
    const { data } = await supabase
      .from('work_entries')
      .select('project_id, amount')
      .eq('company_id', companyId)
      .eq('work_date', date)
      .neq('project_id', projectId)
    if (data && data.length) {
      base.otherAmount = data.reduce((s, e) => s + (Number(e.amount) || 0), 0)
      base.otherJobs = new Set(data.map(e => e.project_id)).size
    }
    setDoneSheet(base)
  }

  async function addPiece() {
    if (!canAddPiece) return
    const qty = Number(pieceQty)

    // Catalog pick: log against the existing item exactly as before.
    if (isCatalogPick) {
      const it = pick.item
      try {
        await createEntry({
          entry_type: 'piece',
          work_item_id: it.id,
          unit: it.unit,
          quantity: qty,
          hours: null,
          rate_snapshot: it.rate,
          amount: qty * (Number(it.rate) || 0),
          description: it.name,
          work_date: date,
        })
        resetComposer()
        flash(TOASTS.entryLogged)
      } catch (err) {
        alert('Failed to add entry: ' + err.message)
      }
      return
    }

    // Inline-create paths (library or custom): work_items insert FIRST, then the
    // work_entry. If the entry write fails, the catalog item stays (it is real);
    // the retry finds it in the catalog section.
    const rate = Number(inlineRate)
    let newItem
    try {
      newItem = isLibraryPick
        ? await createFromLibrary(pick.row, rate)
        : await createItem({ library_item_id: null, category: null, name: pick.name.trim(), unit: customUnit, segment: null, rate, is_active: true })
    } catch (err) {
      alert('Failed to save item: ' + err.message)
      return
    }
    try {
      await createEntry({
        entry_type: 'piece',
        work_item_id: newItem.id,
        unit: newItem.unit,
        quantity: qty,
        hours: null,
        rate_snapshot: rate,
        amount: qty * rate,
        description: newItem.name,
        work_date: date,
      })
      resetComposer()
      flash(TOASTS.itemSaved)
    } catch (err) {
      alert('Item saved to your catalog, but logging the entry failed: ' + err.message + '\nSearch it again to log against it.')
      resetComposer()
    }
  }

  async function addHourly() {
    if (!canAddHourly) return
    const h = Number(hours)

    // Catalog HOUR item: log against the existing item, rate locked as before.
    if (isHCatalog) {
      const it = hourlyPick.item
      try {
        await createEntry({
          entry_type: 'hourly',
          work_item_id: it.id,
          unit: 'hour',
          quantity: null,
          hours: h,
          rate_snapshot: Number(it.rate) || 0,
          amount: h * (Number(it.rate) || 0),
          description: it.name,
          work_date: date,
        })
        resetHourly()
        flash(TOASTS.entryLogged)
      } catch (err) {
        alert('Failed to add entry: ' + err.message)
      }
      return
    }

    // Free-text HOUR entry: no catalog item, work_item_id null (as today).
    if (isHCustom) {
      const rate = Number(hourlyRate)
      try {
        await createEntry({
          entry_type: 'hourly',
          work_item_id: null,
          unit: 'hour',
          quantity: null,
          hours: h,
          rate_snapshot: rate,
          amount: h * rate,
          description: hourlyPick.text.trim() || null,
          work_date: date,
        })
        resetHourly()
        flash(TOASTS.entryLogged)
      } catch (err) {
        alert('Failed to add entry: ' + err.message)
      }
      return
    }

    // Library HOUR item: work_items insert FIRST (createFromLibrary), then the
    // work_entry — same two-insert safety as the piece inline-create path.
    const rate = Number(hourlyRate)
    let newItem
    try {
      newItem = await createFromLibrary(hourlyPick.row, rate)
    } catch (err) {
      alert('Failed to save item: ' + err.message)
      return
    }
    try {
      await createEntry({
        entry_type: 'hourly',
        work_item_id: newItem.id,
        unit: 'hour',
        quantity: null,
        hours: h,
        rate_snapshot: rate,
        amount: h * rate,
        description: newItem.name,
        work_date: date,
      })
      resetHourly()
      flash(TOASTS.itemSaved)
    } catch (err) {
      alert('Item saved to your catalog, but logging the entry failed: ' + err.message + '\nSearch it again to log against it.')
      resetHourly()
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
            <NewJobSheet
              gcs={gcs}
              createProject={createProject}
              onCreated={handleJobCreated}
              onCancel={() => setShowNewJob(false)}
            />
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
              !pick ? (
                <WorkItemSearch
                  ref={searchRef}
                  mode="piece"
                  catalog={catalog}
                  library={library}
                  onPickCatalog={pickCatalog}
                  onPickLibrary={pickLibrary}
                  onPickCustom={pickCustom}
                />
              ) : (
                <>
                  <div className={styles.rowBetween} style={{ marginBottom: 10 }}>
                    <div className={styles.entryName}>{isCatalogPick ? pick.item.name : isLibraryPick ? pick.row.name : pick.name}</div>
                    <button type="button" className={styles.linkBtn} onClick={resetComposer}>Change</button>
                  </div>
                  <div className={styles.fieldRow}>
                    {isCustomPick && (
                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>Unit</span>
                        <select className={styles.select} value={customUnit} onChange={e => setCustomUnit(e.target.value)}>
                          {LITE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </div>
                    )}
                    {inlineNeedsRate && (
                      <div className={styles.field}>
                        <span className={styles.fieldLabel}>Your rate for this GC ($)</span>
                        <input className={styles.input} type="number" step="0.01" min="0.01" value={inlineRate} onChange={e => setInlineRate(e.target.value)} placeholder="0.00" autoFocus />
                      </div>
                    )}
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Quantity{pickUnit ? ` (${unitLabel(pickUnit)})` : ''}</span>
                      <input ref={qtyRef} className={styles.input} type="number" step="0.01" min="0" value={pieceQty} onChange={e => setPieceQty(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  <div className={styles.rowBetween}>
                    <span className={styles.amountPreview}>{fmtMoney(piecePreview)}</span>
                    <button className={styles.primaryBtn} disabled={!canAddPiece} onClick={addPiece}><Plus size={16} /> Add</button>
                  </div>
                </>
              )
            ) : (
              !hourlyPick ? (
                <WorkItemSearch
                  mode="hourly"
                  catalog={catalog}
                  library={library}
                  onPickCatalog={pickHourlyCatalog}
                  onPickLibrary={pickHourlyLibrary}
                  onPickCustom={pickHourlyCustom}
                />
              ) : (
                <>
                  <div className={styles.rowBetween} style={{ marginBottom: 10 }}>
                    <div className={styles.entryName}>{hourlyName}</div>
                    <button type="button" className={styles.linkBtn} onClick={resetHourly}>Change</button>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>Hours</span>
                      <input ref={hoursRef} className={styles.input} type="number" step="0.01" min="0" value={hours} onChange={e => setHours(e.target.value)} placeholder="0" />
                    </div>
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>{isHLibrary ? 'Your rate for this GC ($/hr)' : 'Rate ($/hr)'}</span>
                      <input className={styles.input} type="number" step="0.01" min={isHLibrary ? '0.01' : '0'} value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="0.00" readOnly={isHCatalog} autoFocus={isHLibrary} />
                    </div>
                  </div>
                  <div className={styles.rowBetween}>
                    <span className={styles.amountPreview}>{fmtMoney(hourlyPreview)}</span>
                    <button className={styles.primaryBtn} disabled={!canAddHourly} onClick={addHourly}><Plus size={16} /> Add</button>
                  </div>
                </>
              )
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

        {/* Done for today — only once this job has an entry on this date. */}
        {job && entries.length > 0 && (
          <button className={styles.primaryBtn} style={{ width: '100%' }} onClick={openDoneSheet}>
            Done for today
          </button>
        )}
      </main>

      {doneSheet && (
        <>
          <div className={styles.sheetBackdrop} onClick={() => setDoneSheet(null)} />
          <div className={styles.sheet} role="dialog" aria-label="Done for today">
            <h2 className={styles.sheetTitle}>Done for today</h2>
            <p className={styles.subtitle} style={{ marginBottom: 12 }}>{job?.name} · {date}</p>

            <div className={styles.rowBetween} style={{ padding: '8px 0' }}>
              <span className={styles.entryMeta}>{doneSheet.count} {doneSheet.count === 1 ? 'entry' : 'entries'} logged</span>
              <span className={styles.entryAmount}>{fmtMoney(doneSheet.total)}</span>
            </div>

            {doneSheet.otherJobs > 0 && (
              <p className={styles.entryMeta} style={{ marginTop: 4 }}>
                Plus {fmtMoney(doneSheet.otherAmount)} across {doneSheet.otherJobs} other {doneSheet.otherJobs === 1 ? 'job' : 'jobs'} today.
              </p>
            )}

            <p className={styles.muted} style={{ marginTop: 12 }}>{DONE_CLOSER}</p>

            <div className={styles.sheetActions}>
              <button className={styles.secondaryBtn} onClick={() => setDoneSheet(null)}>Keep logging</button>
              <button className={styles.primaryBtn} onClick={() => navigate('/home')}>Back to Home</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
