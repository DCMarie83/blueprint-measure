import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2, Clock, Plus, Download, Printer, UserPlus, Users, Link2, Copy, Check, AlertTriangle, MapPin, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import {
  getActiveProjects, getCrewMembers, getAllCrewMembers,
  ensureMyCrewMember, createCrewMember, updateCrewMember, deleteCrewMember,
  getMyTimeEntries, getCompanyTimeEntries,
  createTimeEntry, createCrewDayEntries, updateTimeEntry, deleteTimeEntry,
  summarizePay, paystubRows,
  getPendingPunches, approvePunch, rejectPunch, closeOpenPunch,
  sendRivetPayLinkEmail,
} from '../data/timeTracking'
import PayTable from '../components/PayTable'
import Modal from '../components/ui/Modal'
import TimeEntryImportModal from '../components/time/TimeEntryImportModal'
import styles from './TimePage.module.css'
import { ScrollbarInside } from '../components/common/FloatingScrollbar'

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

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

function periodLabel(period) {
  const r = periodRange(period)
  return r.from ? `${r.from} to ${r.to}` : 'All time'
}

function fmtLocalTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function fmtLocalDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}

function hoursSince(iso) {
  if (!iso) return 0
  return ((Date.now() - new Date(iso).getTime()) / 3600000)
}

export default function TimePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, userProfile, company, isSuperAdmin } = useAuth()
  const { companyId: effectiveCompanyId } = useEffectiveCompany()
  const companyId = effectiveCompanyId
  const isAdmin = isSuperAdmin || userProfile?.role === 'contractor_admin'

  const [tab, setTab] = useState('my')
  const [showImport, setShowImport] = useState(false)
  const [projects, setProjects] = useState([])
  const [crew, setCrew] = useState([])
  const [allCrew, setAllCrew] = useState([])
  const [myCrewId, setMyCrewId] = useState(null)
  const [myEntries, setMyEntries] = useState([])
  const [teamEntries, setTeamEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('week')
  const [from, setFrom] = useState(() => periodRange('week').from || '')
  const [to, setTo] = useState(() => periodRange('week').to || '')

  const [workerFilter, setWorkerFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date')

  // Single-entry form
  const [formProject, setFormProject] = useState('')
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formHours, setFormHours] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Crew-day form
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

  // Roster
  const [showRoster, setShowRoster] = useState(false)
  const [newWorkerName, setNewWorkerName] = useState('')
  const [rosterSaving, setRosterSaving] = useState(null)

  // Punches
  const [punches, setPunches] = useState([])
  const [punchAction, setPunchAction] = useState(null) // id being acted on
  const [closeHours, setCloseHours] = useState({})

  // Timesheet collapse
  const [timesheetOpen, setTimesheetOpen] = useState(false)

  // Link share modal
  const [shareCm, setShareCm] = useState(null)
  const [shareQr, setShareQr] = useState(null)
  const [copied, setCopied] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')
  // Message type drives styling (error vs success) — never sniff the text, which
  // breaks once the message is translated.
  const [emailMsgType, setEmailMsgType] = useState('error')

  // ── Load ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user || !companyId) return
    setLoading(true)
    try {
      const myCm = await ensureMyCrewMember(companyId, user.id, userProfile?.full_name)
      setMyCrewId(myCm?.id || null)

      const range = {}
      if (from) range.from = from
      if (to) range.to = to
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
        const [team, all, pending] = await Promise.all([
          getCompanyTimeEntries(companyId, range),
          getAllCrewMembers(companyId),
          getPendingPunches(companyId),
        ])
        setTeamEntries(team)
        setAllCrew(all)
        setPunches(pending)
        setCdRows(crewList.map(c => ({ crewMemberId: c.id, name: c.name, hours: '', notes: '' })))
      }
    } catch (err) {
      console.error('Time load:', err)
    } finally {
      setLoading(false)
    }
  }, [user, companyId, userProfile?.full_name, from, to, isAdmin])

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
    } catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
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
    } catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
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
    } catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setEditSaving(false) }
  }

  async function handleDelete(id) {
    if (!window.confirm(t('time:confirm.deleteEntry'))) return
    try { await deleteTimeEntry(id); await loadData() }
    catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
  }

  // ── Roster ──────────────────────────────────────────────────────────────
  async function handleAddWorker(e) {
    e.preventDefault()
    if (!newWorkerName.trim() || !companyId) return
    setRosterSaving('add')
    try { await createCrewMember({ companyId, name: newWorkerName.trim() }); setNewWorkerName(''); await loadData() }
    catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setRosterSaving(null) }
  }

  async function handleToggleActive(cm) {
    setRosterSaving(cm.id)
    try { await updateCrewMember(cm.id, { is_active: !cm.is_active }); await loadData() }
    catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setRosterSaving(null) }
  }

  async function handleDeleteWorker(cm) {
    if (!window.confirm(t('time:confirm.deleteWorker', { name: cm.name }))) return
    setRosterSaving(cm.id)
    try { await deleteCrewMember(cm.id); await loadData() }
    catch (err) { alert(err.message) }
    finally { setRosterSaving(null) }
  }

  async function handleRateSave(cm, value) {
    setRosterSaving(cm.id)
    try {
      await updateCrewMember(cm.id, { cost_rate: value === '' ? null : Number(value) })
      setAllCrew(prev => prev.map(c => c.id === cm.id ? { ...c, cost_rate: value === '' ? null : Number(value) } : c))
    } catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setRosterSaving(null) }
  }

  async function handleToggleLink(cm) {
    setRosterSaving(cm.id)
    try { await updateCrewMember(cm.id, { link_enabled: !cm.link_enabled }); await loadData() }
    catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setRosterSaving(null) }
  }

  async function openShareModal(cm) {
    setShareCm(cm)
    setCopied(false)
    setShareQr(null)
    setShareEmail(cm.email || '')
    setEmailSending(false)
    setEmailMsg('')
    try {
      const QRCode = (await import('qrcode')).default
      const url = `${window.location.origin}/rivetpay/${cm.link_token}`
      const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2 })
      setShareQr(dataUrl)
    } catch { /* QR gen failed — still show the URL */ }
  }

  async function handleCopyLink() {
    if (!shareCm) return
    const url = `${window.location.origin}/rivetpay/${shareCm.link_token}`
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    catch { alert(t('time:errors.copyFailed')) }
  }

  async function handleSendLinkEmail() {
    const trimmed = shareEmail.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailMsg(t('time:share.invalidEmail'))
      setEmailMsgType('error')
      return
    }
    setEmailSending(true)
    setEmailMsg('')
    try {
      if (shareCm && trimmed !== (shareCm.email || '')) {
        await updateCrewMember(shareCm.id, { email: trimmed })
        setAllCrew(prev => prev.map(c => c.id === shareCm.id ? { ...c, email: trimmed } : c))
        setShareCm(prev => prev ? { ...prev, email: trimmed } : prev)
      }
      await sendRivetPayLinkEmail(shareCm.id, trimmed)
      setEmailMsg(t('time:share.sent'))
      setEmailMsgType('success')
    } catch (err) {
      setEmailMsg(t('time:errors.generic', { error: err.message || t('common:action.sendFailed') }))
      setEmailMsgType('error')
    } finally {
      setEmailSending(false)
    }
  }

  // ── Punch actions ───────────────────────────────────────────────────────
  async function handleApprove(id) {
    setPunchAction(id)
    try { await approvePunch(id); await loadData() }
    catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setPunchAction(null) }
  }

  async function handleReject(id) {
    if (!window.confirm(t('time:confirm.rejectSubmission'))) return
    setPunchAction(id)
    try { await rejectPunch(id); await loadData() }
    catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setPunchAction(null) }
  }

  async function handleClosePunch(id) {
    const hrs = closeHours[id]
    if (!hrs || Number(hrs) <= 0) { alert(t('time:errors.enterHours')); return }
    setPunchAction(id)
    try { await closeOpenPunch(id, Number(hrs)); await loadData() }
    catch (err) { alert(t('time:errors.generic', { error: err.message || t('common:misc.unknownError') })) }
    finally { setPunchAction(null) }
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const myTotal = myEntries.reduce((s, e) => s + Number(e.hours), 0)

  const visibleEntries = useMemo(() => {
    let filtered = teamEntries
    if (workerFilter !== 'all') filtered = filtered.filter(e => e.crew_member_id === workerFilter)
    if (sortBy === 'job') {
      filtered = [...filtered].sort((a, b) => {
        const ja = (a.projects?.name || '').toLowerCase(), jb = (b.projects?.name || '').toLowerCase()
        if (ja !== jb) return ja.localeCompare(jb)
        return b.work_date.localeCompare(a.work_date)
      })
    }
    return filtered
  }, [teamEntries, workerFilter, sortBy])

  const perJob = useMemo(() => {
    const pj = {}
    for (const e of visibleEntries) { const n = e.projects?.name || '—'; pj[n] = (pj[n] || 0) + Number(e.hours) }
    return pj
  }, [visibleEntries])

  const payRows = useMemo(() => summarizePay(visibleEntries, allCrew), [visibleEntries, allCrew])
  const visibleTotal = visibleEntries.reduce((s, e) => s + Number(e.hours), 0)
  const stubs = useMemo(() => paystubRows(visibleEntries, allCrew), [visibleEntries, allCrew])
  const filterWorkerName = workerFilter === 'all' ? 'All workers' : (crew.find(c => c.id === workerFilter)?.name || 'Worker')

  const submittedPunches = punches.filter(p => p.status === 'submitted')
  const openPunches = punches.filter(p => p.status === 'open')

  // ── Export ──────────────────────────────────────────────────────────────
  async function handleExport() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Time Entries')
    ws.getCell(1, 1).value = company?.name || 'Time Export'
    ws.getCell(1, 1).font = { bold: true, size: 16 }
    const scopeLabel = workerFilter !== 'all' ? filterWorkerName : 'All workers'
    ws.getCell(2, 1).value = `${from ? `${from} to ${to}` : 'All time'} — ${scopeLabel}`
    ws.getCell(2, 1).font = { size: 10, italic: true, color: { argb: 'FF666666' } }
    const headers = ['Worker', 'Date', 'Job', 'Hours', 'Rate', 'Pay', 'Notes']
    const hRow = ws.getRow(4)
    const hFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2426' } }
    const hFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    headers.forEach((h, i) => { const c = hRow.getCell(i + 1); c.value = h; c.font = hFont; c.fill = hFill })
    ws.getColumn(1).width = 22; ws.getColumn(2).width = 12; ws.getColumn(3).width = 26
    ws.getColumn(4).width = 10; ws.getColumn(5).width = 12; ws.getColumn(6).width = 12; ws.getColumn(7).width = 30
    ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 0 }]
    const rateMap = {}; for (const c of allCrew) rateMap[c.id] = Number(c.cost_rate) || 0
    let row = 5; let totalPay = 0
    for (const e of visibleEntries) {
      const r = ws.getRow(row++); const rate = rateMap[e.crew_member_id] || 0; const hrs = Number(e.hours); const pay = hrs * rate; totalPay += pay
      r.getCell(1).value = e.crew_members?.name || '—'; r.getCell(2).value = e.work_date; r.getCell(3).value = e.projects?.name || '—'
      const hc = r.getCell(4); hc.value = hrs; hc.numFmt = '0.00'
      const rc = r.getCell(5); rc.value = rate; rc.numFmt = '$#,##0.00'
      const pc = r.getCell(6); pc.value = pay; pc.numFmt = '$#,##0.00'
      r.getCell(7).value = e.notes || ''
    }
    row++; ws.getCell(row, 1).value = 'TOTAL'; ws.getCell(row, 1).font = { bold: true }
    const tc = ws.getCell(row, 4); tc.value = visibleTotal; tc.numFmt = '0.00'; tc.font = { bold: true }
    const tpc = ws.getCell(row, 6); tpc.value = totalPay; tpc.numFmt = '$#,##0.00'; tpc.font = { bold: true }
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    const slug = workerFilter !== 'all' ? filterWorkerName.replace(/\s+/g, '-').toLowerCase() : 'all'
    a.download = `time-${slug}-${range.from || 'all'}.xlsx`; a.click(); URL.revokeObjectURL(url)
  }

  // ── Render entry ────────────────────────────────────────────────────────
  function renderEntry(entry, showName) {
    if (editId === entry.id) {
      return (
        <tr key={entry.id} className={styles.tr}>
          {showName && <td className={styles.td}><select className={styles.inlineInput} value={editCrew} onChange={e => setEditCrew(e.target.value)}>{crew.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>}
          <td className={styles.td}><input type="date" className={styles.inlineInput} value={editDate} onChange={e => setEditDate(e.target.value)} /></td>
          <td className={styles.td}><select className={styles.inlineInput} value={editProject} onChange={e => setEditProject(e.target.value)}><option value="">—</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
          <td className={styles.td}><input type="number" className={styles.inlineInput} style={{ width: 70 }} step="0.25" min="0.25" max="24" value={editHours} onChange={e => setEditHours(e.target.value)} /></td>
          <td className={styles.td}><input type="text" className={styles.inlineInput} value={editNotes} onChange={e => setEditNotes(e.target.value)} /></td>
          <td className={styles.td}><button className={styles.saveBtn} onClick={() => handleEditSave(entry.id)} disabled={editSaving}>{editSaving ? '…' : t('common:action.save')}</button><button className={styles.cancelBtn} onClick={() => setEditId(null)}>{t('common:action.cancel')}</button></td>
        </tr>
      )
    }
    return (
      <tr key={entry.id} className={styles.tr}>
        {showName && <td className={styles.td} style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{entry.crew_members?.name || '—'}</td>}
        <td className={styles.td}>{entry.work_date}</td>
        <td className={styles.td} style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{entry.projects?.name || '—'}</td>
        <td className={styles.td} style={{ fontWeight: 600, textAlign: 'right' }}>{Number(entry.hours).toFixed(2)}</td>
        <td className={styles.td} style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{entry.notes || ''}</td>
        <td className={styles.td}>
          <button className={styles.iconBtn} onClick={() => startEdit(entry)} title={t('common:action.edit')}><Pencil size={14} /></button>
          <button className={styles.iconBtn} onClick={() => handleDelete(entry.id)} title={t('common:action.delete')}><Trash2 size={14} /></button>
        </td>
      </tr>
    )
  }

  function handlePeriodClick(v) {
    setPeriod(v)
    if (v === 'all') {
      setFrom('')
      setTo('')
    } else {
      const r = periodRange(v)
      setFrom(r.from || '')
      setTo(r.to || '')
    }
  }

  function handleFromChange(e) {
    setFrom(e.target.value)
    setPeriod('custom')
  }

  function handleToChange(e) {
    setTo(e.target.value)
    setPeriod('custom')
  }

  const periodPills = (
    <div className={styles.filterRow}>
      {[{ v: 'week', l: t('time:period.thisWeek') }, { v: 'month', l: t('time:period.thisMonth') }, { v: 'all', l: t('time:period.all') }].map(p => (
        <button key={p.v} className={`${styles.chip} ${period === p.v ? styles.chipActive : ''}`} onClick={() => handlePeriodClick(p.v)}>{p.l}</button>
      ))}
      <div className={styles.dateRow}>
        <label className={styles.dateLabel}>{t('time:filter.from')}
          <input type="date" className={styles.dateInput} value={from} onChange={handleFromChange} disabled={period === 'all'} />
        </label>
        <label className={styles.dateLabel}>{t('time:filter.to')}
          <input type="date" className={styles.dateInput} value={to} onChange={handleToChange} disabled={period === 'all'} />
        </label>
      </div>
    </div>
  )

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <div className={styles.header} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h1 className={styles.title}><Clock size={24} /> {t('time:page.title')}</h1>
          {isAdmin && (
            <button
              onClick={() => setShowImport(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <Upload size={15} /> {t('time:import.button')}
            </button>
          )}
        </div>

        {showImport && (
          <Modal title={t('time:import.title')} onClose={() => setShowImport(false)}>
            <TimeEntryImportModal onClose={() => setShowImport(false)} onImported={loadData} />
          </Modal>
        )}

        <div className={styles.tabRow}>
          <button className={`${styles.tab} ${tab === 'my' ? styles.tabActive : ''}`} onClick={() => setTab('my')}>{t('time:tabs.myTime')}</button>
          {isAdmin && (
            <button className={`${styles.tab} ${tab === 'team' ? styles.tabActive : ''}`} onClick={() => setTab('team')}>
              <Users size={14} /> {t('time:tabs.team')}
              {submittedPunches.length > 0 && <span className={styles.punchBadge}>{submittedPunches.length}</span>}
            </button>
          )}
        </div>

        {loading ? <div className={styles.empty}>{t('common:misc.loading')}</div> : (
          <>
            {/* ══ My Time ═══════════════════════════════════════════════ */}
            {tab === 'my' && (
              <>
                <form className={styles.addForm} onSubmit={handleAdd}>
                  <select className={styles.formInput} value={formProject} onChange={e => setFormProject(e.target.value)} required>
                    <option value="">{t('time:form.selectJob')}</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` — ${p.client_name}` : ''}</option>)}
                  </select>
                  <input type="date" className={styles.formInput} value={formDate} onChange={e => setFormDate(e.target.value)} required />
                  <input type="number" className={styles.formInput} style={{ width: 90 }} placeholder={t('time:form.hoursPlaceholder')} step="0.25" min="0.25" max="24" value={formHours} onChange={e => setFormHours(e.target.value)} required />
                  <input type="text" className={styles.formInput} style={{ flex: 1, minWidth: 120 }} placeholder={t('time:form.notesOptional')} value={formNotes} onChange={e => setFormNotes(e.target.value)} />
                  <button type="submit" className={styles.addBtn} disabled={submitting}>{submitting ? t('time:common.saving') : t('time:form.logTime')}</button>
                </form>
                {periodPills}
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>{t('time:myTime.title')}</h2>
                    <span className={styles.totalBadge}>{t('time:units.hrs', { value: myTotal.toFixed(2) })}</span>
                  </div>
                  {myEntries.length === 0 ? <p className={styles.empty}>{t('time:myTime.empty')}</p> : (
                    <div className={styles.tableWrap}><ScrollbarInside /><table className={styles.table}>
                      <thead><tr><th className={styles.th}>{t('time:table.date')}</th><th className={styles.th}>{t('time:table.job')}</th><th className={styles.th} style={{ textAlign: 'right' }}>{t('time:table.hours')}</th><th className={styles.th}>{t('time:table.notes')}</th><th className={styles.th}></th></tr></thead>
                      <tbody>{myEntries.map(e => renderEntry(e, false))}</tbody>
                    </table></div>
                  )}
                </section>
              </>
            )}

            {/* ══ Team ══════════════════════════════════════════════════ */}
            {tab === 'team' && isAdmin && (
              <>
                {/* ── Pending Approvals ────────────────────────────────── */}
                {(submittedPunches.length > 0 || openPunches.length > 0) && (
                  <section className={styles.approvalSection}>
                    <h2 className={styles.sectionTitle}>
                      {t('time:approvals.title')}
                      {submittedPunches.length > 0 && <span className={styles.punchBadge} style={{ marginLeft: 8 }}>{submittedPunches.length}</span>}
                    </h2>

                    {submittedPunches.length > 0 && (
                      <div className={styles.tableWrap}><ScrollbarInside /><table className={styles.table}>
                        <thead><tr>
                          <th className={styles.th}>{t('time:table.worker')}</th><th className={styles.th}>{t('time:table.job')}</th><th className={styles.th}>{t('time:table.date')}</th>
                          <th className={styles.th}>{t('time:table.time')}</th><th className={styles.th}>{t('time:table.hours')}</th><th className={styles.th}>{t('time:table.loc')}</th>
                          <th className={styles.th}>{t('time:table.source')}</th><th className={styles.th}></th>
                        </tr></thead>
                        <tbody>
                          {submittedPunches.map(p => (
                            <tr key={p.id} className={styles.tr}>
                              <td className={styles.td} style={{ fontWeight: 500 }}>{p.crew_members?.name || '—'}</td>
                              <td className={styles.td}>{p.projects?.name || '—'}</td>
                              <td className={styles.td}>{fmtLocalDate(p.clock_in_at)}</td>
                              <td className={styles.td} style={{ fontSize: 12 }}>
                                {fmtLocalTime(p.clock_in_at)}{p.clock_out_at ? ` → ${fmtLocalTime(p.clock_out_at)}` : ''}
                              </td>
                              <td className={styles.td} style={{ fontWeight: 600 }}>{p.hours ? Number(p.hours).toFixed(2) : '—'}</td>
                              <td className={styles.td}>
                                {p.source === 'manual' ? (
                                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t('time:punch.manual')}</span>
                                ) : p.clock_out_lat ? (
                                  <a href={`https://www.google.com/maps?q=${p.clock_out_lat},${p.clock_out_lng}`} target="_blank" rel="noopener noreferrer" className={styles.locLink}><MapPin size={10} /> {t('time:punch.loc')}</a>
                                ) : (
                                  <span className={styles.noLocBadge}><AlertTriangle size={10} /> {t('time:punch.noLocation')}</span>
                                )}
                              </td>
                              <td className={styles.td} style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.source}</td>
                              <td className={styles.td}>
                                <button className={styles.approveBtn} onClick={() => handleApprove(p.id)} disabled={punchAction === p.id}>{t('time:punch.approve')}</button>
                                <button className={styles.iconBtn} onClick={() => handleReject(p.id)} disabled={punchAction === p.id} style={{ color: '#ef4444' }}>{t('time:punch.reject')}</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    )}

                    {openPunches.length > 0 && (
                      <>
                        <h3 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 8px', color: 'var(--color-text-muted)' }}>{t('time:approvals.inProgress')}</h3>
                        <div className={styles.tableWrap}><ScrollbarInside /><table className={styles.table}>
                          <thead><tr>
                            <th className={styles.th}>{t('time:table.worker')}</th><th className={styles.th}>{t('time:table.job')}</th><th className={styles.th}>{t('time:table.since')}</th>
                            <th className={styles.th}>{t('time:table.loc')}</th><th className={styles.th}>{t('time:table.elapsed')}</th><th className={styles.th}></th>
                          </tr></thead>
                          <tbody>
                            {openPunches.map(p => {
                              const elapsed = hoursSince(p.clock_in_at)
                              return (
                                <tr key={p.id} className={styles.tr}>
                                  <td className={styles.td} style={{ fontWeight: 500 }}>{p.crew_members?.name || '—'}</td>
                                  <td className={styles.td}>{p.projects?.name || '—'}</td>
                                  <td className={styles.td}>{fmtLocalTime(p.clock_in_at)}</td>
                                  <td className={styles.td}>
                                    {p.clock_in_lat ? (
                                      <a href={`https://www.google.com/maps?q=${p.clock_in_lat},${p.clock_in_lng}`} target="_blank" rel="noopener noreferrer" className={styles.locLink}><MapPin size={10} /> {t('time:punch.loc')}</a>
                                    ) : <span className={styles.noLocBadge}><AlertTriangle size={10} /> {t('time:punch.noLocation')}</span>}
                                  </td>
                                  <td className={styles.td}>
                                    <span style={{ fontWeight: 600, color: elapsed > 10 ? '#ef4444' : 'var(--color-text)' }}>
                                      {t('time:units.hrs', { value: elapsed.toFixed(1) })}
                                    </span>
                                    {elapsed > 10 && <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 4 }}>{t('time:punch.long')}</span>}
                                  </td>
                                  <td className={styles.td}>
                                    <input type="number" className={styles.inlineInput} style={{ width: 70 }} step="0.25" min="0.25" max="24" placeholder={t('time:form.hrsPlaceholder')}
                                      value={closeHours[p.id] || ''} onChange={e => setCloseHours(prev => ({ ...prev, [p.id]: e.target.value }))} />
                                    <button className={styles.saveBtn} style={{ marginLeft: 4 }} onClick={() => handleClosePunch(p.id)} disabled={punchAction === p.id}>{t('common:action.close')}</button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table></div>
                      </>
                    )}
                  </section>
                )}

                {/* Crew-day quick entry */}
                <form className={styles.crewDayForm} onSubmit={handleCrewDay}>
                  <h3 className={styles.crewDayTitle}>{t('time:crewDay.title')}</h3>
                  <div className={styles.crewDayHeader}>
                    <select className={styles.formInput} value={cdProject} onChange={e => setCdProject(e.target.value)} required>
                      <option value="">{t('time:form.selectJob')}</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` — ${p.client_name}` : ''}</option>)}
                    </select>
                    <input type="date" className={styles.formInput} value={cdDate} onChange={e => setCdDate(e.target.value)} required />
                  </div>
                  <div className={styles.crewDayGrid}>
                    {cdRows.map((r, i) => (
                      <div key={r.crewMemberId} className={styles.crewDayRow}>
                        <span className={styles.crewDayName}>{r.name}</span>
                        <input type="number" className={styles.formInput} style={{ width: 80 }} step="0.25" min="0" max="24" placeholder={t('time:form.hrsPlaceholder')} value={r.hours} onChange={e => updateCdRow(i, 'hours', e.target.value)} />
                        <input type="text" className={styles.formInput} style={{ flex: 1, minWidth: 80 }} placeholder={t('time:form.notesShort')} value={r.notes} onChange={e => updateCdRow(i, 'notes', e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <button type="submit" className={styles.addBtn} disabled={cdSaving}>{cdSaving ? t('time:common.saving') : t('time:crewDay.saveDay')}</button>
                </form>

                {periodPills}
                <div className={styles.teamControls}>
                  <select className={styles.formInput} value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}>
                    <option value="all">{t('time:filter.allWorkers')}</option>
                    {crew.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className={styles.formInput} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="date">{t('time:filter.sortDate')}</option>
                    <option value="job">{t('time:filter.sortJob')}</option>
                  </select>
                </div>

                {visibleEntries.length > 0 && (
                  <div className={styles.totalsRow}>
                    <div className={styles.totalsCard}>
                      <h4 className={styles.totalsTitle}>{t('time:totals.byJob')}</h4>
                      {Object.entries(perJob).sort((a, b) => b[1] - a[1]).map(([name, hrs]) => (
                        <div key={name} className={styles.totalsLine}><span>{name}</span><span>{hrs.toFixed(2)}</span></div>
                      ))}
                    </div>
                    <div className={styles.totalsCard}>
                      <h4 className={styles.totalsTitle}>{t('time:totals.pay')}</h4>
                      <PayTable rows={payRows} />
                    </div>
                  </div>
                )}

                <section className={styles.section}>
                  <div className={styles.sectionHeader} style={{ cursor: 'pointer' }} onClick={() => setTimesheetOpen(v => !v)}>
                    <h2 className={styles.sectionTitle}>
                      {t('time:timesheet.title')} {timesheetOpen ? '▾' : '▸'}
                      <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                        {t('time:timesheet.entryCount', { count: visibleEntries.length })}
                      </span>
                    </h2>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={styles.totalBadge}>{t('time:units.hrs', { value: visibleTotal.toFixed(2) })}</span>
                      <button className={styles.exportBtn} onClick={e => { e.stopPropagation(); handleExport() }}><Download size={14} /> {t('time:actions.export')}</button>
                      <button className={styles.exportBtn} onClick={e => { e.stopPropagation(); window.print() }}><Printer size={14} /> {t('time:actions.print')}</button>
                    </div>
                  </div>
                  {timesheetOpen && (
                    visibleEntries.length === 0 ? <p className={styles.empty}>{workerFilter !== 'all' ? t('time:timesheet.emptyPeriodWorker') : t('time:timesheet.emptyPeriod')}</p> : (
                      <div className={styles.tableWrap}><ScrollbarInside /><table className={styles.table}>
                        <thead><tr><th className={styles.th}>{t('time:table.worker')}</th><th className={styles.th}>{t('time:table.date')}</th><th className={styles.th}>{t('time:table.job')}</th><th className={styles.th} style={{ textAlign: 'right' }}>{t('time:table.hours')}</th><th className={styles.th}>{t('time:table.notes')}</th><th className={styles.th}></th></tr></thead>
                        <tbody>{visibleEntries.map(e => renderEntry(e, true))}</tbody>
                      </table></div>
                    )
                  )}
                </section>

                {/* Print paystubs */}
                <div className={styles.payPrintArea}>
                  {stubs.map((stub, idx) => (
                    <div key={stub.crewMemberId} className={idx > 0 ? styles.stubPageBreak : undefined}>
                      <div className={styles.stubHeader}>{company?.logo_url && <img src={company.logo_url} alt="" className={styles.stubLogo} />}<div className={styles.stubCompanyName}>{company?.name || t('time:paystub.companyFallback')}</div></div>
                      <h2 className={styles.stubTitle}>{t('time:paystub.title')}</h2>
                      <div className={styles.stubMeta}><span><strong>{stub.name}</strong></span><span>{from ? t('time:common.dateRange', { from, to }) : t('time:common.allTime')}</span></div>
                      <table className={styles.stubTable}><thead><tr><th className={styles.stubTh}>{t('time:table.job')}</th><th className={styles.stubTh} style={{ textAlign: 'right' }}>{t('time:table.hours')}</th><th className={styles.stubTh} style={{ textAlign: 'right' }}>{t('time:table.rate')}</th><th className={styles.stubTh} style={{ textAlign: 'right' }}>{t('time:table.pay')}</th></tr></thead>
                        <tbody>{stub.jobs.map(j => (<tr key={j.job}><td className={styles.stubTd}>{j.job}</td><td className={styles.stubTd} style={{ textAlign: 'right' }}>{j.hours.toFixed(2)}</td><td className={styles.stubTd} style={{ textAlign: 'right' }}>{stub.rate > 0 ? fmtUSD.format(stub.rate) : <span className={styles.noRateHint}>$0.00</span>}</td><td className={styles.stubTd} style={{ textAlign: 'right' }}>{fmtUSD.format(j.pay)}</td></tr>))}</tbody>
                        <tfoot><tr className={styles.stubTotalsRow}><td className={styles.stubTd} style={{ fontWeight: 700 }}>{t('time:common.total')}</td><td className={styles.stubTd} style={{ textAlign: 'right', fontWeight: 700 }}>{stub.totalHours.toFixed(2)}</td><td className={styles.stubTd}></td><td className={styles.stubTd} style={{ textAlign: 'right', fontWeight: 700 }}>{fmtUSD.format(stub.totalPay)}</td></tr></tfoot>
                      </table>
                      <div className={styles.stubFooter}>{t('common:misc.poweredBy')}</div>
                    </div>
                  ))}
                  <p className={styles.printGenerated}>{t('time:print.generated', { date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) })}</p>
                </div>

                {/* Crew roster */}
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle} style={{ cursor: 'pointer' }} onClick={() => setShowRoster(v => !v)}>
                      <UserPlus size={16} /> {t('time:roster.title')} {showRoster ? '▾' : '▸'}
                    </h2>
                  </div>
                  {showRoster && (
                    <div className={styles.rosterWrap}>
                      <form className={styles.rosterAdd} onSubmit={handleAddWorker}>
                        <input type="text" className={styles.formInput} style={{ flex: 1 }} placeholder={t('time:roster.newWorkerPlaceholder')} value={newWorkerName} onChange={e => setNewWorkerName(e.target.value)} required />
                        <button type="submit" className={styles.addBtn} disabled={rosterSaving === 'add'}><Plus size={14} /> {t('common:action.add')}</button>
                      </form>
                      <div className={styles.tableWrap}><ScrollbarInside /><table className={styles.table}>
                        <thead><tr>
                          <th className={styles.th}>{t('time:roster.name')}</th><th className={styles.th}>{t('time:table.rate')}</th><th className={styles.th}>{t('time:roster.type')}</th>
                          <th className={styles.th}>{t('time:roster.link')}</th><th className={styles.th}>{t('time:roster.status')}</th><th className={styles.th}></th>
                        </tr></thead>
                        <tbody>
                          {allCrew.map(cm => (
                            <tr key={cm.id} className={styles.tr}>
                              <td className={styles.td} style={{ fontWeight: 500 }}>
                                <button className={styles.iconBtn} style={{ fontWeight: 500, color: 'var(--color-primary)' }} onClick={() => navigate(`/time/crew/${cm.id}`)}>{cm.name}</button>
                              </td>
                              <td className={styles.td}>
                                <input type="number" className={styles.inlineInput} style={{ width: 80 }} step="0.01" min="0" placeholder="—"
                                  defaultValue={cm.cost_rate ?? ''} onBlur={e => handleRateSave(cm, e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} disabled={rosterSaving === cm.id} />
                              </td>
                              <td className={styles.td} style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{cm.user_id ? t('time:roster.login') : t('time:roster.noLogin')}</td>
                              <td className={styles.td}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                                  <input type="checkbox" checked={cm.link_enabled ?? true} onChange={() => handleToggleLink(cm)} disabled={rosterSaving === cm.id} />
                                  {cm.link_enabled !== false ? t('time:roster.on') : t('time:roster.off')}
                                </label>
                                {cm.link_enabled !== false && (
                                  <button className={styles.iconBtn} onClick={() => openShareModal(cm)} style={{ marginLeft: 4 }} title={t('time:roster.shareLink')}>
                                    <Link2 size={13} />
                                  </button>
                                )}
                              </td>
                              <td className={styles.td}>
                                <span className={cm.is_active ? styles.badgeActive : styles.badgeInactive}>{cm.is_active ? t('time:roster.active') : t('time:roster.inactive')}</span>
                              </td>
                              <td className={styles.td}>
                                <button className={styles.iconBtn} onClick={() => handleToggleActive(cm)} disabled={rosterSaving === cm.id}>{cm.is_active ? t('time:roster.deactivate') : t('time:roster.activate')}</button>
                                {!cm.user_id && <button className={styles.iconBtn} style={{ color: 'var(--color-danger, #ef4444)' }} onClick={() => handleDeleteWorker(cm)} disabled={rosterSaving === cm.id}>{t('common:action.delete')}</button>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>

      {/* Share link modal */}
      {shareCm && (
        <div className={styles.modalBackdrop} onClick={() => setShareCm(null)}>
          <div className={styles.shareModal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{t('time:share.title', { name: shareCm.name })}</h3>
            {shareCm.link_enabled === false && (
              <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 8px' }}>{t('time:share.linkOff')}</p>
            )}
            <div className={styles.shareUrlRow}>
              <input type="text" readOnly className={styles.shareUrlInput} value={`${window.location.origin}/rivetpay/${shareCm.link_token}`} />
              <button className={styles.copyBtn} onClick={handleCopyLink}>
                {copied ? <><Check size={14} /> {t('time:share.copied')}</> : <><Copy size={14} /> {t('time:share.copy')}</>}
              </button>
            </div>
            {shareQr && <img src={shareQr} alt={t('time:share.qrAlt')} className={styles.qrImg} />}
            <div className={styles.emailSection}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>{t('time:share.emailLabel')}</div>
              <div className={styles.shareUrlRow}>
                <input
                  type="email"
                  className={styles.shareUrlInput}
                  style={{ fontFamily: 'inherit' }}
                  placeholder={t('time:share.emailPlaceholder')}
                  value={shareEmail}
                  onChange={e => { setShareEmail(e.target.value); setEmailMsg('') }}
                />
                <button className={styles.copyBtn} onClick={handleSendLinkEmail} disabled={emailSending}>
                  {emailSending ? t('time:share.sending') : t('common:action.send')}
                </button>
              </div>
              {emailMsg && (
                <p style={{ fontSize: 12, margin: '4px 0 0', color: emailMsgType === 'error' ? '#ef4444' : '#22c55e' }}>
                  {emailMsg}
                </p>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '12px 0 0', textAlign: 'center' }}>
              {t('time:share.instructions', { name: shareCm.name })}
            </p>
            <button className={styles.exportBtn} style={{ marginTop: 12, width: '100%', justifyContent: 'center' }} onClick={() => setShareCm(null)}>{t('common:action.close')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
