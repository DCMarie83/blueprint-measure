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
import { GC_CLIENT_TYPE, LITE_UNITS, unitLabel, fmtMoney } from '../../lib/lite'
import styles from './lite.module.css'

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function LogPage() {
  const { companyId, company } = useEffectiveCompany()
  const { projects, createProject } = useProjects()
  const { clients, createClient } = useClients()

  const [date, setDate] = useState(todayStr())
  const [projectId, setProjectId] = useState('')
  const [mode, setMode] = useState('piece')
  const [toast, setToast] = useState('')

  // Piece composer — type-ahead over the GC catalog + the platform library.
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [pick, setPick] = useState(null) // null | {type:'catalog',item} | {type:'library',row} | {type:'custom',name}
  const [inlineRate, setInlineRate] = useState('')
  const [customUnit, setCustomUnit] = useState('each')
  const [pieceQty, setPieceQty] = useState('')
  const [library, setLibrary] = useState([])
  const qtyRef = useRef(null)

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

  const { items: catalog, loading: catalogLoading, createItem, createFromLibrary } = useWorkItems(gcId)
  const activeItems = useMemo(() => catalog.filter(i => i.is_active), [catalog])
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

  // Debounce the search box (250ms); nothing searches under 2 chars.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])

  // Reset the composer selection when the job (and thus the GC catalog) changes.
  useEffect(() => {
    setPick(null); setSearch(''); setDebounced(''); setInlineRate(''); setPieceQty(''); setCustomUnit('each')
  }, [projectId])

  // Merged results: GC catalog first (capped 5), then library minus items already
  // in this GC's catalog (capped 6). Case-insensitive substring on name.
  const results = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (q.length < 2) return { catalog: [], library: [] }
    const catMatches = activeItems.filter(i => i.name?.toLowerCase().includes(q)).slice(0, 5)
    const existingLibIds = new Set(catalog.map(i => i.library_item_id).filter(Boolean))
    const libMatches = library.filter(l => !existingLibIds.has(l.id) && l.name?.toLowerCase().includes(q)).slice(0, 6)
    return { catalog: catMatches, library: libMatches }
  }, [debounced, activeItems, catalog, library])

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
  const hourlyPreview = (Number(hours) || 0) * (Number(hourlyRate) || 0)

  function pickCatalog(item) {
    setPick({ type: 'catalog', item }); setSearch(''); setDebounced(''); setPieceQty('')
    setTimeout(() => qtyRef.current?.focus(), 0)
  }
  function pickLibrary(row) { setPick({ type: 'library', row }); setInlineRate(''); setPieceQty('') }
  function pickCustom(name) { setPick({ type: 'custom', name }); setCustomUnit('each'); setInlineRate(''); setPieceQty('') }
  function resetComposer() {
    setPick(null); setSearch(''); setDebounced(''); setInlineRate(''); setPieceQty(''); setCustomUnit('each')
  }

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
        flash('Logged it — good dog!')
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
      flash('New item saved — good dog!')
    } catch (err) {
      alert('Item saved to your catalog, but logging the entry failed: ' + err.message + '\nSearch it again to log against it.')
      resetComposer()
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
              !pick ? (
                <div className={styles.field} style={{ marginBottom: 0 }}>
                  <span className={styles.fieldLabel}>What did you work on?</span>
                  <input className={styles.input} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" />
                  {debounced.trim().length >= 2 && (
                    <div className={styles.searchResults}>
                      {results.catalog.length > 0 && <div className={styles.searchSection}>Your catalog</div>}
                      {results.catalog.map(i => (
                        <button key={i.id} type="button" className={styles.searchItem} onClick={() => pickCatalog(i)}>
                          <span className={styles.searchName}>{i.name}</span>
                          <span className={styles.searchMeta}>{unitLabel(i.unit)} · {fmtMoney(i.rate)}</span>
                        </button>
                      ))}
                      {results.library.length > 0 && <div className={styles.searchSection}>Add from library</div>}
                      {results.library.map(l => (
                        <button key={l.id} type="button" className={styles.searchItem} onClick={() => pickLibrary(l)}>
                          <span className={styles.searchName}>{l.name}</span>
                          <span className={styles.searchMeta}>{unitLabel(l.unit)}{l.billing_note ? ` · ${l.billing_note}` : ''}</span>
                        </button>
                      ))}
                      <button type="button" className={styles.searchItem} onClick={() => pickCustom(debounced.trim())}>
                        <span className={styles.searchName}>Add “{debounced.trim()}” as a custom item</span>
                      </button>
                    </div>
                  )}
                </div>
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
