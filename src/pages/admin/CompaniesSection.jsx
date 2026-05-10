import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import { getAllPlans, getPlanOptions, FEATURE_KEYS } from '../../lib/plans'
import CompanyDrawer from '../../components/admin/CompanyDrawer'
import styles from './sections.module.css'

const FEATURES = FEATURE_KEYS

const PAGE_SIZE = 25

function formatStorageMb(mb) {
  if (mb < 1) return `${(mb).toFixed(1)} MB`
  if (mb < 1024) return mb % 1 === 0 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function useTempId() {
  const [id, setId] = useState(null)
  const timers = useRef({})
  function flash(newId) {
    if (timers.current[newId]) clearTimeout(timers.current[newId])
    setId(newId)
    timers.current[newId] = setTimeout(() => setId(cur => cur === newId ? null : cur), 2000)
  }
  return [id, flash]
}

export default function CompaniesSection() {
  const {
    companies, setCompanies, users, userProfiles, setUserProfiles,
    sessions, sessionsThisMonthFor, sessionCountFor, loadAll,
  } = useAdminData()

  const location = useLocation()

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

  // Inline editing (name, notes, seat)
  const [editingNameId, setEditingNameId] = useState(null)
  const [editingNameVal, setEditingNameVal] = useState('')
  const [savingNameId, setSavingNameId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [editingSeatId, setEditingSeatId] = useState(null)
  const [editingSeatVal, setEditingSeatVal] = useState('')
  const [savingSeatId, setSavingSeatId] = useState(null)

  // Storage
  const [companyStorage, setCompanyStorage] = useState({})
  const [storageLoading, setStorageLoading] = useState({})

  // Drawer
  const [drawerCompanyId, setDrawerCompanyId] = useState(null)
  const [companyZoneCounts, setCompanyZoneCounts] = useState({})
  const [loadingZoneCount, setLoadingZoneCount] = useState({})

  // Pending changes (FIX-4/5)
  const [pendingChanges, setPendingChanges] = useState({}) // { [companyId]: { plan?, features? } }
  const [savingRowId, setSavingRowId] = useState(null)
  const [savedRowId, flashSaved] = useTempId()

  const [plansData, setPlansData] = useState(null)
  useState(() => { getAllPlans().then(setPlansData) })
  const PLAN_FEATURES = plansData ?? {}

  function getEffectiveSeatLimit(company) {
    if (company.seat_limit_override != null) return company.seat_limit_override
    return PLAN_FEATURES[company.plan]?.seat_limit ?? 1
  }

  // Navigation guard — warn if leaving with pending changes
  const pendingCount = Object.keys(pendingChanges).length
  useEffect(() => {
    if (pendingCount === 0) return
    function onBeforeUnload(e) { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pendingCount])

  // When navigating away within the SPA, the location changes
  const prevPath = useRef(location.pathname)
  useEffect(() => {
    if (prevPath.current !== location.pathname && pendingCount > 0) {
      if (!window.confirm(`You have unsaved changes on ${pendingCount} companies. Discard?`)) {
        // Can't truly block SPA navigation, but warn user
      }
      setPendingChanges({})
    }
    prevPath.current = location.pathname
  }, [location.pathname])

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

  // Pending change helpers
  function getPendingPlan(companyId, saved) {
    return pendingChanges[companyId]?.plan ?? saved
  }
  function getPendingFlags(companyId, saved) {
    return pendingChanges[companyId]?.features ?? saved
  }
  function hasPending(companyId) {
    return !!pendingChanges[companyId]
  }

  function handlePlanChange(companyId, newPlan) {
    setPendingChanges(prev => ({
      ...prev,
      [companyId]: { ...(prev[companyId] ?? {}), plan: newPlan },
    }))
  }

  function handleFlagToggle(companyId, currentFlags, flagKey) {
    const pending = pendingChanges[companyId]?.features ?? currentFlags
    const updated = { ...pending, [flagKey]: !pending[flagKey] }
    setPendingChanges(prev => ({
      ...prev,
      [companyId]: { ...(prev[companyId] ?? {}), features: updated },
    }))
  }

  function handleDiscard(companyId) {
    setPendingChanges(prev => {
      const next = { ...prev }
      delete next[companyId]
      return next
    })
  }

  async function handleSaveRow(companyId) {
    const pending = pendingChanges[companyId]
    if (!pending) return
    setSavingRowId(companyId)
    try {
      const company = companies.find(c => c.id === companyId)
      const update = {}
      if (pending.plan) {
        update.plan = pending.plan
        const planConfig = PLAN_FEATURES[pending.plan]
        update.blueprint_limit = planConfig?.blueprint_limit ?? company.blueprint_limit
        update.features = pending.features ?? planConfig?.features ?? company.features
      }
      if (pending.features && !pending.plan) {
        update.features = pending.features
      }
      const { error } = await supabase.from('companies').update(update).eq('id', companyId)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, ...update } : c))
      handleDiscard(companyId)
      flashSaved(companyId)
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSavingRowId(null)
    }
  }

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

  // Drawer open — also lazy-load zone counts
  function handleOpenDrawer(companyId) {
    setDrawerCompanyId(companyId)
    if (companyZoneCounts[companyId] !== undefined) return
    setLoadingZoneCount(prev => ({ ...prev, [companyId]: true }))
    const userIds = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const thisMonthSessionIds = sessions.filter(s => userIds.includes(s.user_id) && s.created_at >= monthStart).map(s => s.id).filter(Boolean)
    if (thisMonthSessionIds.length === 0) {
      setCompanyZoneCounts(prev => ({ ...prev, [companyId]: 0 }))
      setLoadingZoneCount(prev => ({ ...prev, [companyId]: false }))
      return
    }
    supabase.from('zones').select('id', { count: 'exact', head: true }).in('session_id', thisMonthSessionIds)
      .then(({ count }) => {
        setCompanyZoneCounts(prev => ({ ...prev, [companyId]: count ?? 0 }))
        setLoadingZoneCount(prev => ({ ...prev, [companyId]: false }))
      })
  }

  const PLANS_LIST = Object.values(PLAN_FEATURES).length > 0
    ? Object.entries(PLAN_FEATURES).map(([k, v]) => ({ value: k, label: v.display_name ?? k }))
    : getPlanOptions()

  // Drawer data
  const drawerCompany = drawerCompanyId ? companies.find(c => c.id === drawerCompanyId) : null
  const drawerUserIds = drawerCompany ? userProfiles.filter(p => p.company_id === drawerCompanyId).map(p => p.user_id) : []
  const drawerUsers = users.filter(u => drawerUserIds.includes(u.id))

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
                <th className={styles.th} style={{ width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {paged.map(company => {
                const savedFlags = company.features ?? {}
                const displayFlags = getPendingFlags(company.id, savedFlags)
                const displayPlan = getPendingPlan(company.id, company.plan)
                const isPending = hasPending(company.id)
                const companyUserIds = userProfiles.filter(p => p.company_id === company.id).map(p => p.user_id)
                const companyUsers = users.filter(u => companyUserIds.includes(u.id))
                return (
                  <tr key={company.id} className={`${styles.tr} ${isPending ? styles.trPending : ''}`}>
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
                      <select
                        className={styles.planSelect}
                        value={displayPlan}
                        onChange={e => handlePlanChange(company.id, e.target.value)}
                        style={isPending && pendingChanges[company.id]?.plan ? { borderColor: '#f59e0b' } : undefined}
                      >
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
                          <span className={styles.usageCount}>{companyUsers.length} / {getEffectiveSeatLimit(company) ?? '���'}</span>
                          <span className={styles.seatBadge}>{company.seat_limit_override != null ? '(custom)' : '(default)'}</span>
                          <button className={styles.iconBtn} onClick={() => { setEditingSeatId(company.id); setEditingSeatVal(company.seat_limit_override != null ? String(company.seat_limit_override) : '') }}>✎</button>
                        </div>
                      )}
                    </td>
                    <td className={styles.td} data-no-expand>
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
                          const on = !!displayFlags[key]
                          return (
                            <label key={key} className={styles.flagRow}>
                              <input type="checkbox" className={styles.flagCheck} checked={on}
                                onChange={() => handleFlagToggle(company.id, savedFlags, key)}
                                style={isPending && pendingChanges[company.id]?.features ? { accentColor: '#f59e0b' } : undefined} />
                              <span className={on ? styles.flagLabelOn : styles.flagLabel}>{label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </td>
                    <td className={styles.td} data-no-expand>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {isPending && (
                          <>
                            <button className={styles.submitBtn} onClick={() => handleSaveRow(company.id)} disabled={savingRowId === company.id} style={{ padding: '4px 12px', fontSize: 12 }}>
                              {savingRowId === company.id ? '…' : 'Save'}
                            </button>
                            <button className={styles.secondaryBtn} onClick={() => handleDiscard(company.id)} style={{ padding: '4px 10px', fontSize: 12 }}>
                              Discard
                            </button>
                          </>
                        )}
                        {savedRowId === company.id && <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>Saved</span>}
                        <button className={styles.deleteBtn} onClick={() => handleDelete(company)} disabled={deletingId === company.id}>
                          {deletingId === company.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                    <td className={styles.td} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => handleOpenDrawer(company.id)}>
                      <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
                    </td>
                  </tr>
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

      {/* Side drawer */}
      {drawerCompany && (
        <CompanyDrawer
          company={drawerCompany}
          companyUsers={drawerUsers}
          sessionsThisMonth={sessionsThisMonthFor(drawerCompanyId)}
          sessionsAllTime={sessionCountFor(drawerCompanyId)}
          zonesThisMonth={companyZoneCounts[drawerCompanyId] ?? 0}
          zonesLoading={!!loadingZoneCount[drawerCompanyId]}
          onClose={() => setDrawerCompanyId(null)}
        />
      )}
    </div>
  )
}
