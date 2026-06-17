import { useState, useEffect, useCallback, useMemo } from 'react'
import { Pencil, Trash2, Clock, Plus, Download, UserPlus, Users } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import {
  getActiveProjects, getCrewMembers, getAllCrewMembers,
  ensureMyCrewMember, createCrewMember, updateCrewMember, deleteCrewMember,
  getMyTimeEntries, getCompanyTimeEntries,
  createTimeEntry, createCrewDayEntries, updateTimeEntry, deleteTimeEntry,
} from '../data/timeTracking'
import styles from './TimePage.module.css'

function periodRange(period) {
  const now = new Date()
  if (period === 'week') {
    const day = now.getDay()
    const diffToMon = day === 0 ? 6 : day - 1
    const mon = new Date(now); mon.setDate(now.getDate() - diffToMon)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) }
  }
  if (period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
  }
  return {}
}

export default function TimePage() {
  const { user, userProfile, company, isSuperAdmin } = useAuth()
  const companyId = userProfile?.company_id || company?.id
  const isAdmin = isSuperAdmin || userProfile?.role === 'contractor_admin'

  const [tab, setTab] = useState('my')
  const [projects, setProjects] = useState([])
  const [crew, setCrew] = useState([])
  const [allCrew, setAllCrew] = useState([])
  const [myCrewId, setMyCrewId] = useState(null)
  const [myEntries, setMyEntries] = useState([])
  const [teamEntries, setTeamEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('week')

  // Single-entry form
  const [formProject, setFormProject] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formHours, setFormHours] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Crew-day form (admin)
  const [cdProject, setCdProject] = useState('')
  const [cdDate, setCdDate] = useState(new Date().toISOString().slice(0, 10))
  const [cdRows, setCdRows] = useState([])
  const [cdSaving, setCdSaving] = useState(false)

  // Inline edit
  const [editId, setEditId] = useState(null)
  const [editCrew, setEditCrew] = useState('')
  const [editProject, setEditProject] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editHours, setEditHours] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Crew roster (admin)
  const [showRoster, setShowRoster] = useState(false)
  const [newWorkerName, setNewWorkerName] = useState('')
  const [rosterSaving, setRosterSaving] = useState(null)

  // ── Load ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user || !companyId) return
    setLoading(true)
    try {
      const myCm = await ensureMyCrewMember(companyId, user.id, userProfile?.full_name)
      setMyCrewId(myCm?.id || null)

      const range = periodRange(period)
      const [projs, crewList] = await Promise.all([
        getActiveProjects(companyId),
        getCrewMembers(companyId),
      ])
      setProjects(projs)
      setCrew(crewList)

      if (myCm?.id) {
        const mine = await getMyTimeEntries(myCm.id, range)
        setMyEntries(mine)
      }

      if (isAdmin) {
        const [team, all] = await Promise.all([
          getCompanyTimeEntries(companyId, range),
          getAllCrewMembers(companyId),
        ])
        setTeamEntries(team)
        setAllCrew(all)
        // Init crew-day rows from active crew
        setCdRows(crewList.map(c => ({ crewMemberId: c.id, name: c.name, hours: '', notes: '' })))
      }
    } catch (err) {
      console.error('Time load:', err)
    } finally {
      setLoading(false)
    }
  }, [user, companyId, userProfile?.full_name, period, isAdmin])

  useEffect(() => { loadData() }, [loadData])

  // ── Single entry ────────────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault()
    if (!formProject || !formHours || !companyId || !myCrewId) return
    setSubmitting(true)
    try {
      await createTimeEntry({ companyId, crewMemberId: myCrewId, projectId: formProject, workDate: formDate, hours: parseFloat(formHours), notes: formNotes })
      setFormProject(''); setFormHours(''); setFormNotes(''); setFormDate(new Date().toISOString().slice(0, 10))
      await loadData()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setSubmitting(false) }
  }

  // ── Crew-day bulk ───────────────────────────────────────────────────────
  async function handleCrewDay(e) {
    e.preventDefault()
    if (!cdProject || !companyId) return
    setCdSaving(true)
    try {
      await createCrewDayEntries({ companyId, projectId: cdProject, workDate: cdDate, rows: cdRows })
      setCdRows(crew.map(c => ({ crewMemberId: c.id, name: c.name, hours: '', notes: '' })))
      await loadData()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setCdSaving(false) }
  }

  function updateCdRow(idx, field, val) {
    setCdRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }

  // ── Edit / delete ───────────────────────────────────────────────────────
  function startEdit(entry) {
    setEditId(entry.id); setEditCrew(entry.crew_member_id); setEditProject(entry.project_id)
    setEditDate(entry.work_date); setEditHours(entry.hours); setEditNotes(entry.notes || '')
  }

  async function handleEditSave(id) {
    setEditSaving(true)
    try {
      await updateTimeEntry(id, { crewMemberId: editCrew, projectId: editProject, workDate: editDate, hours: parseFloat(editHours), notes: editNotes })
      setEditId(null); await loadData()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setEditSaving(false) }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this time entry?')) return
    try { await deleteTimeEntry(id); await loadData() }
    catch (err) { alert('Error: ' + err.message) }
  }

  // ── Crew roster ─────────────────────────────────────────────────────────
  async function handleAddWorker(e) {
    e.preventDefault()
    if (!newWorkerName.trim() || !companyId) return
    setRosterSaving('add')
    try {
      await createCrewMember({ companyId, name: newWorkerName.trim() })
      setNewWorkerName('')
      await loadData()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setRosterSaving(null) }
  }

  async function handleToggleActive(cm) {
    setRosterSaving(cm.id)
    try { await updateCrewMember(cm.id, { is_active: !cm.is_active }); await loadData() }
    catch (err) { alert('Error: ' + err.message) }
    finally { setRosterSaving(null) }
  }

  async function handleDeleteWorker(cm) {
    if (!window.confirm(`Delete ${cm.name}? Only works if they have no entries.`)) return
    setRosterSaving(cm.id)
    try { await deleteCrewMember(cm.id); await loadData() }
    catch (err) { alert(err.message) }
    finally { setRosterSaving(null) }
  }

  // ── Totals ──────────────────────────────────────────────────────────────
  const myTotal = myEntries.reduce((s, e) => s + Number(e.hours), 0)

  const { perJob, perWorker, teamTotal } = useMemo(() => {
    const pj = {}, pw = {}
    let total = 0
    for (const e of teamEntries) {
      const jName = e.projects?.name || '—'
      const wName = e.crew_members?.name || '—'
      pj[jName] = (pj[jName] || 0) + Number(e.hours)
      pw[wName] = (pw[wName] || 0) + Number(e.hours)
      total += Number(e.hours)
    }
    return { perJob: pj, perWorker: pw, teamTotal: total }
  }, [teamEntries])

  // ── Export ──────────────────────────────────────────────────────────────
  async function handleExport() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Time Entries')

    // Header
    ws.getCell(1, 1).value = company?.name || 'Time Export'
    ws.getCell(1, 1).font = { bold: true, size: 16 }
    const range = periodRange(period)
    ws.getCell(2, 1).value = range.from ? `${range.from} to ${range.to}` : 'All time'
    ws.getCell(2, 1).font = { size: 10, italic: true, color: { argb: 'FF666666' } }

    const headers = ['Worker', 'Date', 'Job', 'Hours', 'Notes']
    const hRow = ws.getRow(4)
    const hFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
    const hFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    headers.forEach((h, i) => {
      const c = hRow.getCell(i + 1)
      c.value = h; c.font = hFont; c.fill = hFill
    })
    ws.getColumn(1).width = 22; ws.getColumn(2).width = 12; ws.getColumn(3).width = 26
    ws.getColumn(4).width = 10; ws.getColumn(5).width = 30
    ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 0 }]

    let row = 5
    for (const e of teamEntries) {
      const r = ws.getRow(row++)
      r.getCell(1).value = e.crew_members?.name || '—'
      r.getCell(2).value = e.work_date
      r.getCell(3).value = e.projects?.name || '—'
      const hc = r.getCell(4); hc.value = Number(e.hours); hc.numFmt = '0.00'
      r.getCell(5).value = e.notes || ''
    }

    row++
    ws.getCell(row, 1).value = 'TOTAL'
    ws.getCell(row, 1).font = { bold: true }
    const tc = ws.getCell(row, 4); tc.value = teamTotal; tc.numFmt = '0.00'; tc.font = { bold: true }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `time-entries-${range.from || 'all'}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render entry row ────────────────────────────────────────────────────
  function renderEntry(entry, showName) {
    if (editId === entry.id) {
      return (
        <tr key={entry.id} className={styles.tr}>
          {showName && (
            <td className={styles.td}>
              <select className={styles.inlineInput} value={editCrew} onChange={e => setEditCrew(e.target.value)}>
                {crew.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </td>
          )}
          <td className={styles.td}><input type="date" className={styles.inlineInput} value={editDate} onChange={e => setEditDate(e.target.value)} /></td>
          <td className={styles.td}>
            <select className={styles.inlineInput} value={editProject} onChange={e => setEditProject(e.target.value)}>
              <option value="">—</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </td>
          <td className={styles.td}><input type="number" className={styles.inlineInput} style={{ width: 70 }} step="0.25" min="0.25" max="24" value={editHours} onChange={e => setEditHours(e.target.value)} /></td>
          <td className={styles.td}><input type="text" className={styles.inlineInput} value={editNotes} onChange={e => setEditNotes(e.target.value)} /></td>
          <td className={styles.td}>
            <button className={styles.saveBtn} onClick={() => handleEditSave(entry.id)} disabled={editSaving}>{editSaving ? '…' : 'Save'}</button>
            <button className={styles.cancelBtn} onClick={() => setEditId(null)}>Cancel</button>
          </td>
        </tr>
      )
    }
    return (
      <tr key={entry.id} className={styles.tr}>
        {showName && <td className={styles.td}>{entry.crew_members?.name || '—'}</td>}
        <td className={styles.td}>{entry.work_date}</td>
        <td className={styles.td}>{entry.projects?.name || '—'}</td>
        <td className={styles.td} style={{ fontWeight: 600 }}>{Number(entry.hours).toFixed(2)}</td>
        <td className={styles.td} style={{ color: 'var(--color-text-muted)' }}>{entry.notes || ''}</td>
        <td className={styles.td}>
          <button className={styles.iconBtn} onClick={() => startEdit(entry)} title="Edit"><Pencil size={14} /></button>
          <button className={styles.iconBtn} onClick={() => handleDelete(entry.id)} title="Delete"><Trash2 size={14} /></button>
        </td>
      </tr>
    )
  }

  // ── Periods pills ───────────────────────────────────────────────────────
  const periodPills = (
    <div className={styles.filterRow}>
      {[{ v: 'week', l: 'This Week' }, { v: 'month', l: 'This Month' }, { v: 'all', l: 'All' }].map(p => (
        <button key={p.v} className={`${styles.chip} ${period === p.v ? styles.chipActive : ''}`} onClick={() => setPeriod(p.v)}>{p.l}</button>
      ))}
    </div>
  )

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}><Clock size={24} /> Time</h1>
        </div>

        {/* Tabs */}
        <div className={styles.tabRow}>
          <button className={`${styles.tab} ${tab === 'my' ? styles.tabActive : ''}`} onClick={() => setTab('my')}>My Time</button>
          {isAdmin && <button className={`${styles.tab} ${tab === 'team' ? styles.tabActive : ''}`} onClick={() => setTab('team')}><Users size={14} /> Team</button>}
        </div>

        {loading ? <div className={styles.empty}>Loading…</div> : (
          <>
            {/* ══ My Time ═══════════════════════════════════════════════ */}
            {tab === 'my' && (
              <>
                <form className={styles.addForm} onSubmit={handleAdd}>
                  <select className={styles.formInput} value={formProject} onChange={e => setFormProject(e.target.value)} required>
                    <option value="">Select job…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` — ${p.client_name}` : ''}</option>)}
                  </select>
                  <input type="date" className={styles.formInput} value={formDate} onChange={e => setFormDate(e.target.value)} required />
                  <input type="number" className={styles.formInput} style={{ width: 90 }} placeholder="Hours" step="0.25" min="0.25" max="24" value={formHours} onChange={e => setFormHours(e.target.value)} required />
                  <input type="text" className={styles.formInput} style={{ flex: 1, minWidth: 120 }} placeholder="Notes (optional)" value={formNotes} onChange={e => setFormNotes(e.target.value)} />
                  <button type="submit" className={styles.addBtn} disabled={submitting}>{submitting ? 'Saving…' : '+ Log Time'}</button>
                </form>

                {periodPills}

                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>My Time</h2>
                    <span className={styles.totalBadge}>{myTotal.toFixed(2)} hrs</span>
                  </div>
                  {myEntries.length === 0 ? (
                    <p className={styles.empty}>No entries for this period.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead><tr>
                          <th className={styles.th}>Date</th><th className={styles.th}>Job</th>
                          <th className={styles.th}>Hours</th><th className={styles.th}>Notes</th><th className={styles.th}></th>
                        </tr></thead>
                        <tbody>{myEntries.map(e => renderEntry(e, false))}</tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* ══ Team (admin) ══════════════════════════════════════════ */}
            {tab === 'team' && isAdmin && (
              <>
                {/* Crew-day quick entry */}
                <form className={styles.crewDayForm} onSubmit={handleCrewDay}>
                  <h3 className={styles.crewDayTitle}>Crew Day Entry</h3>
                  <div className={styles.crewDayHeader}>
                    <select className={styles.formInput} value={cdProject} onChange={e => setCdProject(e.target.value)} required>
                      <option value="">Select job…</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` — ${p.client_name}` : ''}</option>)}
                    </select>
                    <input type="date" className={styles.formInput} value={cdDate} onChange={e => setCdDate(e.target.value)} required />
                  </div>
                  <div className={styles.crewDayGrid}>
                    {cdRows.map((r, i) => (
                      <div key={r.crewMemberId} className={styles.crewDayRow}>
                        <span className={styles.crewDayName}>{r.name}</span>
                        <input type="number" className={styles.formInput} style={{ width: 80 }} step="0.25" min="0" max="24" placeholder="Hrs" value={r.hours} onChange={e => updateCdRow(i, 'hours', e.target.value)} />
                        <input type="text" className={styles.formInput} style={{ flex: 1, minWidth: 80 }} placeholder="Notes" value={r.notes} onChange={e => updateCdRow(i, 'notes', e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <button type="submit" className={styles.addBtn} disabled={cdSaving}>{cdSaving ? 'Saving…' : 'Save Day'}</button>
                </form>

                {periodPills}

                {/* Per-job + per-worker totals */}
                {teamEntries.length > 0 && (
                  <div className={styles.totalsRow}>
                    <div className={styles.totalsCard}>
                      <h4 className={styles.totalsTitle}>By Job</h4>
                      {Object.entries(perJob).sort((a, b) => b[1] - a[1]).map(([name, hrs]) => (
                        <div key={name} className={styles.totalsLine}><span>{name}</span><span>{hrs.toFixed(2)}</span></div>
                      ))}
                    </div>
                    <div className={styles.totalsCard}>
                      <h4 className={styles.totalsTitle}>By Worker</h4>
                      {Object.entries(perWorker).sort((a, b) => b[1] - a[1]).map(([name, hrs]) => (
                        <div key={name} className={styles.totalsLine}><span>{name}</span><span>{hrs.toFixed(2)}</span></div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Team timesheet */}
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Team Timesheet</h2>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={styles.totalBadge}>{teamTotal.toFixed(2)} hrs</span>
                      <button className={styles.exportBtn} onClick={handleExport} title="Export"><Download size={14} /> Export</button>
                    </div>
                  </div>
                  {teamEntries.length === 0 ? (
                    <p className={styles.empty}>No team entries for this period.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead><tr>
                          <th className={styles.th}>Worker</th><th className={styles.th}>Date</th>
                          <th className={styles.th}>Job</th><th className={styles.th}>Hours</th>
                          <th className={styles.th}>Notes</th><th className={styles.th}></th>
                        </tr></thead>
                        <tbody>{teamEntries.map(e => renderEntry(e, true))}</tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Crew roster */}
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle} style={{ cursor: 'pointer' }} onClick={() => setShowRoster(v => !v)}>
                      <UserPlus size={16} /> Crew Roster {showRoster ? '▾' : '▸'}
                    </h2>
                  </div>
                  {showRoster && (
                    <div className={styles.rosterWrap}>
                      <form className={styles.rosterAdd} onSubmit={handleAddWorker}>
                        <input type="text" className={styles.formInput} style={{ flex: 1 }} placeholder="New worker name" value={newWorkerName} onChange={e => setNewWorkerName(e.target.value)} required />
                        <button type="submit" className={styles.addBtn} disabled={rosterSaving === 'add'}><Plus size={14} /> Add</button>
                      </form>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead><tr>
                            <th className={styles.th}>Name</th><th className={styles.th}>Type</th>
                            <th className={styles.th}>Status</th><th className={styles.th}></th>
                          </tr></thead>
                          <tbody>
                            {allCrew.map(cm => (
                              <tr key={cm.id} className={styles.tr}>
                                <td className={styles.td} style={{ fontWeight: 500 }}>{cm.name}</td>
                                <td className={styles.td} style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{cm.user_id ? 'Login user' : 'No-login worker'}</td>
                                <td className={styles.td}>
                                  <span className={cm.is_active ? styles.badgeActive : styles.badgeInactive}>
                                    {cm.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td className={styles.td}>
                                  <button className={styles.iconBtn} onClick={() => handleToggleActive(cm)} disabled={rosterSaving === cm.id}>
                                    {cm.is_active ? 'Deactivate' : 'Activate'}
                                  </button>
                                  {!cm.user_id && (
                                    <button className={styles.iconBtn} style={{ color: 'var(--color-danger, #ef4444)' }} onClick={() => handleDeleteWorker(cm)} disabled={rosterSaving === cm.id}>
                                      Delete
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
