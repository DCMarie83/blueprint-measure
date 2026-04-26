import { useState, useRef, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import { getAllPlans } from '../../lib/plans'
import styles from './sections.module.css'

const FEATURES = [
  { key: 'multi_page_pdf',     label: 'Multi-page PDF' },
  { key: 'csv_export',         label: 'CSV Export' },
  { key: 'redraw_zones',       label: 'Redraw Zones' },
  { key: 'paint_calculator',   label: 'Paint Calculator' },
  { key: 'ai_scale_detection', label: 'AI Scale Detection' },
  { key: 'wall_calculator',    label: 'Wall Calculator' },
  { key: 'test_mode',          label: 'Test Mode' },
]

const PAGE_SIZE = 25

function formatStorageMb(mb) {
  if (mb < 1) return `${(mb).toFixed(1)} MB`
  if (mb < 1024) return mb % 1 === 0 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

export default function CompaniesSection() {
  const {
    companies, setCompanies, users, userProfiles, setUserProfiles,
    sessions, sessionsThisMonthFor, loadAll,
  } = useAdminData()

  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created')
  const [page, setPage] = useState(0)

  // Add company
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPlan, setNewPlan] = useState('basic')
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Inline editing
  const [editingNameId, setEditingNameId] = useState(null)
  const [editingNameVal, setEditingNameVal] = useState('')
  const [savingNameId, setSavingNameId] = useState(null)
  const [editingNotesId, setEditingNotesId] = useState(null)
  const [notesVal, setNotesVal] = useState('')
  const [savingNotesId, setSavingNotesId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [savingFlags, setSavingFlags] = useState({})
  const [savingPlanId, setSavingPlanId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [companyZoneCounts, setCompanyZoneCounts] = useState({})
  const [loadingZoneCount, setLoadingZoneCount] = useState({})
  const [companyStorage, setCompanyStorage] = useState({})
  const [storageLoading, setStorageLoading] = useState({})

  // Seat editing
  const [editingSeatId, setEditingSeatId] = useState(null)
  const [editingSeatVal, setEditingSeatVal] = useState('')
  const [savingSeatId, setSavingSeatId] = useState(null)

  const [plansData, setPlansData] = useState(null)
  useState(() => { getAllPlans().then(setPlansData) })

  const PLAN_FEATURES = plansData ?? {}

  function getEffectiveSeatLimit(company) {
    if (company.seat_limit_override != null) return company.seat_limit_override
    return PLAN_FEATURES[company.plan]?.seat_limit ?? 1
  }

  // Filter and sort
  let filtered = companies
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q))
  }
  if (planFilter !== 'all') filtered = filtered.filter(c => c.plan === planFilter)

  if (sortBy === 'name') filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  else if (sortBy === 'plan') filtered = [...filtered].sort((a, b) => (a.plan ?? '').localeCompare(b.plan ?? ''))

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Handlers
  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true); setAddError('')
    try {
      const planConfig = PLAN_FEATURES[newPlan]
      const { data, error } = await supabase.from('companies').insert({
        name: newName.trim(), plan: newPlan,
        blueprint_limit: planConfig?.blueprint_limit ?? 10,
        features: planConfig?.features ?? {},
      }).select().single()
      if (error) throw new Error(error.message)
      setCompanies(prev => [...prev, data])
      setNewName(''); setNewPlan('basic'); setShowAdd(false)
    } catch (err) { setAddError(err.message) } finally { setSaving(false) }
  }

  async function handleSaveName(id) {
    const trimmed = editingNameVal.trim()
    if (!trimmed) return
    setSavingNameId(id)
    try {
      const { error } = await supabase.from('companies').update({ name: trimmed }).eq('id', id)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c))
      setEditingNameId(null)
    } catch (err) { alert('Failed: ' + err.message) } finally { setSavingNameId(null) }
  }

  async function handleSaveNotes(id) {
    setSavingNotesId(id)
    try {
      const { error } = await supabase.from('companies').update({ notes: notesVal.trim() || null }).eq('id', id)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, notes: notesVal.trim() || null } : c))
      setEditingNotesId(null)
    } catch (err) { alert('Failed: ' + err.message) } finally { setSavingNotesId(null) }
  }

  async function handleDelete(company) {
    if (!window.confirm(`Delete ${company.name}?\n\nUser accounts will not be deleted.`)) return
    setDeletingId(company.id)
    try {
      const { error } = await supabase.from('companies').delete().eq('id', company.id)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.filter(c => c.id !== company.id))
      setUserProfiles(prev => prev.map(p => p.company_id === company.id ? { ...p, company_id: null } : p))
    } catch (err) { alert('Failed: ' + err.message) } finally { setDeletingId(null) }
  }

  async function handleToggleFlag(company, flagKey) {
    setSavingFlags(prev => ({ ...prev, [company.id]: true }))
    const current = company.features ?? {}
    const updated = { ...current, [flagKey]: !current[flagKey] }
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, features: updated } : c))
    try {
      const { error } = await supabase.from('companies').update({ features: updated }).eq('id', company.id)
      if (error) throw new Error(error.message)
    } catch (err) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, features: current } : c))
      alert('Failed: ' + err.message)
    } finally { setSavingFlags(prev => ({ ...prev, [company.id]: false })) }
  }

  async function handleChangePlan(companyId, newPlan) {
    const planConfig = PLAN_FEATURES[newPlan]
    const newFeatures = planConfig?.features ?? {}
    const newLimit = planConfig?.blueprint_limit ?? 10
    setSavingPlanId(companyId)
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, plan: newPlan, blueprint_limit: newLimit, features: newFeatures } : c))
    try {
      const { error } = await supabase.from('companies').update({ plan: newPlan, blueprint_limit: newLimit, features: newFeatures }).eq('id', companyId)
      if (error) throw new Error(error.message)
    } catch (err) { alert('Failed: ' + err.message); await loadAll() } finally { setSavingPlanId(null) }
  }

  async function handleToggleExpand(companyId) {
    if (expandedId === companyId) { setExpandedId(null); return }
    setExpandedId(companyId)
    if (companyZoneCounts[companyId] !== undefined) return
    setLoadingZoneCount(prev => ({ ...prev, [companyId]: true }))
    try {
      const userIds = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const thisMonthSessionIds = sessions.filter(s => userIds.includes(s.user_id) && s.created_at >= monthStart).map(s => s.id).filter(Boolean)
      let zoneCount = 0
      if (thisMonthSessionIds.length > 0) {
        const { count } = await supabase.from('zones').select('id', { count: 'exact', head: true }).in('session_id', thisMonthSessionIds)
        zoneCount = count ?? 0
      }
      setCompanyZoneCounts(prev => ({ ...prev, [companyId]: zoneCount }))
    } finally { setLoadingZoneCount(prev => ({ ...prev, [companyId]: false })) }
  }

  async function fetchStorage(companyId) {
    if (storageLoading[companyId] || companyStorage[companyId]) return
    setStorageLoading(prev => ({ ...prev, [companyId]: true }))
    try {
      const companyUserIds = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
      let totalBytes = 0, fileCount = 0
      for (const userId of companyUserIds) {
        const { data: files } = await supabase.storage.from('blueprints').list(userId, { limit: 1000 })
        if (files) {
          for (const folder of files) {
            const { data: innerFiles } = await supabase.storage.from('blueprints').list(`${userId}/${folder.name}`, { limit: 1000 })
            if (innerFiles) innerFiles.forEach(f => { totalBytes += f.metadata?.size ?? 0; fileCount++ })
          }
        }
      }
      setCompanyStorage(prev => ({ ...prev, [companyId]: { totalBytes, fileCount } }))
    } catch {} finally { setStorageLoading(prev => ({ ...prev, [companyId]: false })) }
  }

  async function handleSaveSeat(companyId) {
    const val = editingSeatVal.trim()
    const override = val === '' ? null : parseInt(val, 10)
    if (val !== '' && (isNaN(override) || override < 1)) { alert('Must be positive number or empty.'); return }
    setSavingSeatId(companyId)
    try {
      const { error } = await supabase.from('companies').update({ seat_limit_override: override }).eq('id', companyId)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, seat_limit_override: override } : c))
      setEditingSeatId(null)
    } catch (err) { alert('Failed: ' + err.message) } finally { setSavingSeatId(null) }
  }

  const PLANS_LIST = Object.values(PLAN_FEATURES).length > 0
    ? Object.entries(PLAN_FEATURES).map(([k, v]) => ({ value: k, label: v.display_name ?? k }))
    : [{ value: 'basic', label: 'Basic' }, { value: 'plus', label: 'Plus' }, { value: 'ultra', label: 'Ultra' }, { value: 'founders', label: 'Founders' }, { value: 'pilot', label: 'Pilot' }]

  return (
    <div>
      <h1 className={styles.pageTitle}>Companies <span className={styles.pill}>{companies.length}</span></h1>

      <div className={styles.toolbar}>
        <input className={styles.searchInput} placeholder="Search companies…" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        <select className={styles.filterSelect} value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(0) }}>
          <option value="all">All Plans</option>
          {PLANS_LIST.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="created">Created Date</option>
          <option value="name">Name A-Z</option>
          <option value="plan">Plan</option>
        </select>
        <button className={styles.addBtn} onClick={() => { setShowAdd(v => !v); setAddError('') }}>
          {showAdd ? 'Cancel' : '+ New Company'}
        </button>
      </div>

      {showAdd && (
        <form className={styles.form} onSubmit={handleAdd}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Company Name</label>
              <input className={styles.formInput} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Coastal Coat & Paint" required />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Plan</label>
              <select className={styles.formSelect} value={newPlan} onChange={e => setNewPlan(e.target.value)}>
                {PLANS_LIST.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          {addError && <p className={styles.fieldError}>{addError}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Creating…' : 'Create Company'}</button>
          </div>
        </form>
      )}

      {paged.length === 0 ? (
        <p className={styles.empty}>{search || planFilter !== 'all' ? 'No companies match your filters.' : 'No companies yet.'}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Company</th>
                <th className={styles.th}>Plan</th>
                <th className={styles.th}>Seats</th>
                <th className={styles.th}>Storage</th>
                <th className={styles.th}>Usage / Month</th>
                <th className={styles.th}>Flags</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {paged.map(company => {
                const flags = company.features ?? {}
                const isExp = expandedId === company.id
                const companyUserIds = userProfiles.filter(p => p.company_id === company.id).map(p => p.user_id)
                const companyUsers = users.filter(u => companyUserIds.includes(u.id))
                return (
                  <Fragment key={company.id}>
                    <tr className={styles.tr} onClick={e => { if (!e.target.closest('[data-no-expand]')) handleToggleExpand(company.id) }} style={{ cursor: 'pointer' }}>
                      <td className={styles.td}>
                        <div data-no-expand>
                          {editingNameId === company.id ? (
                            <div className={styles.inlineEdit}>
                              <input className={styles.inlineInput} value={editingNameVal} onChange={e => setEditingNameVal(e.target.value)} autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(company.id); if (e.key === 'Escape') setEditingNameId(null) }} />
                              <button className={styles.inlineSaveBtn} onClick={() => handleSaveName(company.id)} disabled={savingNameId === company.id}>{savingNameId === company.id ? '…' : 'Save'}</button>
                              <button className={styles.inlineCancelBtn} onClick={() => setEditingNameId(null)}>✕</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 600 }}>{company.name}</span>
                              <button className={styles.iconBtn} onClick={() => { setEditingNameId(company.id); setEditingNameVal(company.name) }} title="Edit">✎</button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={styles.td} data-no-expand>
                        <select className={styles.planSelect} value={company.plan} onChange={e => handleChangePlan(company.id, e.target.value)} disabled={savingPlanId === company.id}>
                          {PLANS_LIST.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </td>
                      <td className={styles.td} data-no-expand>
                        {editingSeatId === company.id ? (
                          <div className={styles.inlineEdit}>
                            <input type="number" min="1" className={styles.inlineInput} style={{ width: 50 }} value={editingSeatVal} onChange={e => setEditingSeatVal(e.target.value)} autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveSeat(company.id); if (e.key === 'Escape') setEditingSeatId(null) }}
                              placeholder={String(PLAN_FEATURES[company.plan]?.seat_limit ?? 1)} />
                            <button className={styles.inlineSaveBtn} onClick={() => handleSaveSeat(company.id)} disabled={savingSeatId === company.id}>Save</button>
                            <button className={styles.inlineCancelBtn} onClick={() => setEditingSeatId(null)}>✕</button>
                          </div>
                        ) : (
                          <div className={styles.usageCell}>
                            <span className={styles.usageCount}>{companyUsers.length} / {getEffectiveSeatLimit(company) ?? '∞'}</span>
                            <span className={styles.seatBadge}>{company.seat_limit_override != null ? '(custom)' : '(default)'}</span>
                            <button className={styles.iconBtn} onClick={() => { setEditingSeatId(company.id); setEditingSeatVal(company.seat_limit_override != null ? String(company.seat_limit_override) : '') }}>✎</button>
                          </div>
                        )}
                      </td>
                      <td className={styles.td}>
                        {(() => {
                          const stor = companyStorage[company.id]
                          const limitMb = PLAN_FEATURES[company.plan]?.storage_limit_mb
                          if (!stor && !storageLoading[company.id]) return <button className={styles.iconBtn} onClick={() => fetchStorage(company.id)}>Load</button>
                          if (storageLoading[company.id]) return <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>…</span>
                          const usedDisplay = formatStorageMb(stor.totalBytes / (1024 * 1024))
                          const limitDisplay = limitMb != null ? formatStorageMb(limitMb) : '∞'
                          const pct = limitMb != null ? (stor.totalBytes / (limitMb * 1024 * 1024)) * 100 : 0
                          const barColor = pct > 95 ? '#ef4444' : pct > 75 ? '#f59e0b' : 'var(--color-primary)'
                          return (
                            <div className={styles.usageCell}>
                              <span className={styles.usageCount}>{usedDisplay} / {limitDisplay}</span>
                              {limitMb != null && <div className={styles.miniBarTrack}><div className={styles.miniBarFill} style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} /></div>}
                            </div>
                          )
                        })()}
                      </td>
                      <td className={styles.td}>
                        <div className={styles.usageCell}>
                          <span className={styles.usageCount}>{sessionsThisMonthFor(company.id)} / {company.blueprint_limit ?? '∞'}</span>
                          <span className={styles.usageLabel}>this month</span>
                        </div>
                      </td>
                      <td className={styles.td} data-no-expand>
                        <div className={styles.flagGroup}>
                          {FEATURES.map(({ key, label }) => {
                            const on = !!flags[key]
                            return (
                              <label key={key} className={styles.flagRow}>
                                <input type="checkbox" className={styles.flagCheck} checked={on} onChange={() => handleToggleFlag(company, key)} disabled={!!savingFlags[company.id]} />
                                <span className={on ? styles.flagLabelOn : styles.flagLabel}>{label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </td>
                      <td className={styles.td} data-no-expand>
                        <button className={styles.deleteBtn} onClick={() => handleDelete(company)} disabled={deletingId === company.id}>
                          {deletingId === company.id ? '…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                    {isExp && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={7} className={styles.expandedCell}>
                          <div className={styles.expandedPanel}>
                            <div><strong>Sessions this month:</strong> {sessionsThisMonthFor(company.id)}</div>
                            <div><strong>Zones this month:</strong> {loadingZoneCount[company.id] ? '…' : (companyZoneCounts[company.id] ?? 0)}</div>
                            <div><strong>Users ({companyUsers.length}):</strong> {companyUsers.map(u => u.email).join(', ') || 'None'}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} className={`${styles.pageBtn} ${page === i ? styles.pageBtnActive : ''}`} onClick={() => setPage(i)}>{i + 1}</button>
          ))}
        </div>
      )}
    </div>
  )
}
