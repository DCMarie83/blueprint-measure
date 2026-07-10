import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import EnterAccountModal from '../../components/admin/EnterAccountModal'
import { useImpersonation } from '../../context/ImpersonationContext'
import { supabase } from '../../lib/supabase'
import { useAdminData } from '../../context/AdminDataContext'
import { FEATURE_KEYS, useCompanyPlan, GRANDFATHER_DEFAULTS, usePlan } from '../../lib/plans'
import { resolveEntitlements } from '../../lib/entitlements'
import CompanyDrawer from '../../components/admin/CompanyDrawer'
import { US_STATES } from '../../data/usStates'
import styles from './sections.module.css'

const FEATURES = FEATURE_KEYS

const PAGE_SIZE = 25

function formatStorageMb(mb) {
  if (mb < 1) return `${(mb).toFixed(1)} MB`
  if (mb < 1024) return mb % 1 === 0 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

function CompanyPlanBadge({ company }) {
  const plan = useCompanyPlan(company)
  return <span>{plan?.display_name ?? company.plan ?? 'Legacy'}</span>
}

function CompanySeatDisplay({ company, companyUsers }) {
  const plan = usePlan(company.plan_key)
  const { seats } = resolveEntitlements(company, plan)
  return (
    <span className={styles.usageCount}>{companyUsers.length} / {seats ?? '∞'}</span>
  )
}

function CompanyStorageCell({ company, companyStorage, storageLoading, fetchStorage }) {
  const plan = useCompanyPlan(company)
  const limitMb = plan?.unlimited ? null : (plan?.max_storage_gb ?? GRANDFATHER_DEFAULTS.max_storage_gb) * 1024
  const stor = companyStorage[company.id]

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
}

export default function CompaniesSection() {
  const {
    companies, setCompanies, users, userProfiles, setUserProfiles,
    sessions, sessionsThisMonthFor, sessionCountFor,
  } = useAdminData()

  const location = useLocation()

  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created')
  const [page, setPage] = useState(0)

  // Add company
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Inline editing (name, seat)
  const [editingNameId, setEditingNameId] = useState(null)
  const [editingNameVal, setEditingNameVal] = useState('')
  const [savingNameId, setSavingNameId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [editingSeatId, setEditingSeatId] = useState(null)
  const [editingSeatVal, setEditingSeatVal] = useState('')
  const [savingSeatId, setSavingSeatId] = useState(null)
  const [editingStatusId, setEditingStatusId] = useState(null)
  const [savingStatusId, setSavingStatusId] = useState(null)

  // Internal toggle
  const [togglingInternalId, setTogglingInternalId] = useState(null)

  // Impersonation
  const navigate = useNavigate()
  const { startImpersonation } = useImpersonation()
  const [enterAccountTarget, setEnterAccountTarget] = useState(null) // company object

  // Storage
  const [companyStorage, setCompanyStorage] = useState({})
  const [storageLoading, setStorageLoading] = useState({})

  // Drawer
  const [drawerCompanyId, setDrawerCompanyId] = useState(null)
  const [companyZoneCounts, setCompanyZoneCounts] = useState({})
  const [loadingZoneCount, setLoadingZoneCount] = useState({})

  // Filter and sort
  let filtered = companies
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q))
  }
  if (planFilter !== 'all') filtered = filtered.filter(c => (c.plan_key ?? c.plan ?? '') === planFilter)
  if (stateFilter !== 'all') filtered = filtered.filter(c => (c.state ?? '') === stateFilter)
  if (sortBy === 'name') filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  else if (sortBy === 'plan') filtered = [...filtered].sort((a, b) => (a.plan_key ?? a.plan ?? '').localeCompare(b.plan_key ?? b.plan ?? ''))
  else if (sortBy === 'state') filtered = [...filtered].sort((a, b) => (a.state ?? '').localeCompare(b.state ?? ''))

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Derive unique plan keys from companies for filter dropdown
  const planKeys = [...new Set(companies.map(c => c.plan_key ?? c.plan).filter(Boolean))].sort()

  // Per-state real signup count (excludes internal companies)
  const realByState = {}
  for (const c of companies) {
    if (c.is_internal) continue
    const st = c.state || 'Unknown'
    realByState[st] = (realByState[st] || 0) + 1
  }
  const stateFilterLabel = stateFilter !== 'all'
    ? US_STATES.find(s => s.code === stateFilter)?.name || stateFilter
    : null
  const stateFilterCount = stateFilter !== 'all' ? (realByState[stateFilter] || 0) : null

  // Handlers
  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true); setAddError('')
    try {
      const allFeatures = GRANDFATHER_DEFAULTS.features
      const { data, error } = await supabase.from('companies').insert({
        name: newName.trim(),
        subscription_status: 'active',
        features: allFeatures,
      }).select().single()
      if (error) throw new Error(error.message)
      setCompanies(prev => [...prev, data])
      setNewName(''); setShowAdd(false)
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

  async function handleSaveStatus(companyId, newStatus) {
    setSavingStatusId(companyId)
    try {
      const { error } = await supabase.from('companies').update({ subscription_status: newStatus }).eq('id', companyId)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, subscription_status: newStatus } : c))
      setEditingStatusId(null)
    } catch (err) { alert('Failed: ' + err.message) } finally { setSavingStatusId(null) }
  }

  async function handleToggleInternal(company) {
    const next = !company.is_internal
    setTogglingInternalId(company.id)
    try {
      const { data, error } = await supabase.functions.invoke('mark-company-internal', {
        body: { company_id: company.id, internal: next },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, is_internal: next } : c))
    } catch (err) { alert('Failed: ' + err.message) } finally { setTogglingInternalId(null) }
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
          {planKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select className={styles.filterSelect} value={stateFilter} onChange={e => { setStateFilter(e.target.value); setPage(0) }}>
          <option value="all">All States</option>
          {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        <select className={styles.filterSelect} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="created">Created Date</option>
          <option value="name">Name A-Z</option>
          <option value="plan">Plan</option>
          <option value="state">State</option>
        </select>
        <button className={styles.addBtn} onClick={() => { setShowAdd(v => !v); setAddError('') }}>
          {showAdd ? 'Cancel' : '+ New Company'}
        </button>
      </div>

      {stateFilterCount !== null && (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          <strong>{stateFilterLabel}</strong>: {stateFilterCount} real {stateFilterCount === 1 ? 'signup' : 'signups'} (excludes internal)
        </div>
      )}

      {showAdd && (
        <form className={styles.form} onSubmit={handleAdd}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Company Name</label>
              <input className={styles.formInput} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Coastal Coat & Paint" required />
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
                <th className={styles.th}>State</th>
                <th className={styles.th}>Plan</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Seats</th>
                <th className={styles.th}>Storage</th>
                <th className={styles.th}>Usage / Month</th>
                <th className={styles.th}></th>
                <th className={styles.th} style={{ width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {paged.map(company => {
                const companyUserIds = userProfiles.filter(p => p.company_id === company.id).map(p => p.user_id)
                const companyUsers = users.filter(u => companyUserIds.includes(u.id))
                return (
                  <tr key={company.id} className={styles.tr}>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>{company.name}</span>
                            <button className={styles.iconBtn} onClick={() => { setEditingNameId(company.id); setEditingNameVal(company.name) }} title="Edit">✎</button>
                            {company.wants_branding_quote && (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(242,114,67,0.12)', color: 'var(--color-primary)' }}>Branding lead</span>
                            )}
                            {company.is_internal && (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>Internal</span>
                            )}
                            <button
                              className={styles.iconBtn}
                              onClick={() => handleToggleInternal(company)}
                              disabled={togglingInternalId === company.id}
                              title={company.is_internal ? 'Unmark internal' : 'Mark as internal'}
                              style={{ fontSize: 11 }}
                            >
                              {togglingInternalId === company.id ? '…' : company.is_internal ? '⊘' : '⊙'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={styles.td} style={{ fontSize: 12 }}>{company.state || '—'}</td>
                    <td className={styles.td}>
                      <CompanyPlanBadge company={company} />
                    </td>
                    <td className={styles.td} data-no-expand>
                      {editingStatusId === company.id ? (
                        <select
                          autoFocus
                          value={company.subscription_status || 'active'}
                          onChange={e => handleSaveStatus(company.id, e.target.value)}
                          onBlur={() => setEditingStatusId(null)}
                          disabled={savingStatusId === company.id}
                          style={{ fontSize: 11, padding: '2px 4px' }}
                        >
                          {['trialing', 'active', 'past_due', 'suspended', 'canceled', 'paused', 'pilot'].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className={styles.badge} style={{ fontSize: 11 }}>
                            {company.subscription_status ?? 'active'}
                            {company.subscription_status === 'trialing' && !company.recurly_subscription_id && (
                              <span style={{ fontWeight: 400, opacity: 0.7 }}> (no card)</span>
                            )}
                          </span>
                          <button className={styles.iconBtn} onClick={() => setEditingStatusId(company.id)} title="Change status">✎</button>
                          {company.subscription_status === 'trialing' && company.trial_ends_at && (() => {
                            const msLeft = new Date(company.trial_ends_at).getTime() - Date.now()
                            if (msLeft <= 0) return <span style={{ fontSize: 10, color: 'var(--color-danger)', fontWeight: 600 }}>Expired</span>
                            const d = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
                            return <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{d}d left</span>
                          })()}
                        </div>
                      )}
                    </td>
                    <td className={styles.td} data-no-expand>
                      {editingSeatId === company.id ? (
                        <div className={styles.inlineEdit}>
                          <input type="number" min="1" className={styles.inlineInput} style={{ width: 50 }} value={editingSeatVal} onChange={e => setEditingSeatVal(e.target.value)} autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveSeat(company.id); if (e.key === 'Escape') setEditingSeatId(null) }}
                            placeholder="2" />
                          <button className={styles.inlineSaveBtn} onClick={() => handleSaveSeat(company.id)} disabled={savingSeatId === company.id}>Save</button>
                          <button className={styles.inlineCancelBtn} onClick={() => setEditingSeatId(null)}>✕</button>
                        </div>
                      ) : (
                        <div className={styles.usageCell}>
                          <CompanySeatDisplay company={company} companyUsers={companyUsers} />
                          <span className={styles.seatBadge}>{company.seat_limit_override != null ? '(custom)' : '(default)'}</span>
                          <button className={styles.iconBtn} onClick={() => { setEditingSeatId(company.id); setEditingSeatVal(company.seat_limit_override != null ? String(company.seat_limit_override) : '') }}>✎</button>
                        </div>
                      )}
                    </td>
                    <td className={styles.td} data-no-expand>
                      <CompanyStorageCell company={company} companyStorage={companyStorage} storageLoading={storageLoading} fetchStorage={fetchStorage} />
                    </td>
                    <td className={styles.td}>
                      <div className={styles.usageCell}>
                        <span className={styles.usageCount}>{sessionsThisMonthFor(company.id)} / {company.blueprint_limit ?? '∞'}</span>
                        <span className={styles.usageLabel}>this month</span>
                      </div>
                    </td>
                    <td className={styles.td} data-no-expand>
                      <div className={styles.rowActions}>
                        <button className={styles.secondaryBtn} onClick={() => setEnterAccountTarget(company)}>
                          Enter
                        </button>
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

      {/* Enter account modal */}
      {enterAccountTarget && (
        <Modal title="Enter Account" onClose={() => setEnterAccountTarget(null)}>
          <EnterAccountModal
            companyName={enterAccountTarget.name}
            onCancel={() => setEnterAccountTarget(null)}
            onConfirm={async (notes) => {
              await startImpersonation(enterAccountTarget.id, { notes })
              setEnterAccountTarget(null)
              navigate('/dashboard')
            }}
          />
        </Modal>
      )}
    </div>
  )
}
