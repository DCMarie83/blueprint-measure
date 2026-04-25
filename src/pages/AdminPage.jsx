import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './AdminPage.module.css'

const FEATURES = [
  { key: 'multi_page_pdf',     label: 'Multi-page PDF'     },
  { key: 'csv_export',         label: 'CSV Export'         },
  { key: 'redraw_zones',       label: 'Redraw Zones'       },
  { key: 'paint_calculator',   label: 'Paint Calculator'   },
  { key: 'ai_scale_detection', label: 'AI Scale Detection' },
  { key: 'wall_calculator',   label: 'Wall Calculator'   },
  { key: 'test_mode',         label: 'Test Mode'         },
]

const PLANS = [
  { value: 'basic',    label: 'Basic',    limit: 10,  desc: '$150/mo — 10 blueprints/month, standard measurement' },
  { value: 'plus',     label: 'Plus',     limit: 25,  desc: '$250/mo — 25 blueprints/month, all features' },
  { value: 'ultra',    label: 'Ultra',    limit: 50,  desc: '$399/mo — 50 blueprints/month, everything plus priority support' },
  { value: 'founders', label: 'Founders', limit: 25,  desc: '$50/mo — 25 blueprints/month, Plus features, locked for life' },
  { value: 'pilot',    label: 'Pilot',    limit: 999, desc: 'Free pilot access' },
]

// Default feature flags applied when a company is created. Admins can override
// individual flags at any time using the toggles in the company table.
const PLAN_FEATURES = {
  basic:    { multi_page_pdf: false, csv_export: true,  redraw_zones: false, paint_calculator: false, ai_scale_detection: false, wall_calculator: false, test_mode: false, storage_limit_mb: 5120,   seat_limit: 1,    blueprint_limit: 10  },
  plus:     { multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true,  storage_limit_mb: 25600,  seat_limit: 3,    blueprint_limit: 30  },
  ultra:    { multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true,  storage_limit_mb: 102400, seat_limit: 10,   blueprint_limit: 100 },
  founders: { multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true,  storage_limit_mb: 25600,  seat_limit: 1,    blueprint_limit: 50  },
  pilot:    { multi_page_pdf: true,  csv_export: true,  redraw_zones: true,  paint_calculator: true,  ai_scale_detection: true,  wall_calculator: true,  test_mode: true,  storage_limit_mb: null,   seat_limit: null, blueprint_limit: null },
}

// ── tiny helper — show an inline "Sent!" / "Email sent!" for 3 s ─────────────
function useTempId() {
  const [id, setId] = useState(null)
  const timers = useRef({})
  function flash(newId) {
    if (timers.current[newId]) clearTimeout(timers.current[newId])
    setId(newId)
    timers.current[newId] = setTimeout(() => setId(cur => cur === newId ? null : cur), 3000)
  }
  return [id, flash]
}

export default function AdminPage() {
  // ── Data ──────────────────────────────────────────────────────────────────────
  const [companies,    setCompanies]    = useState([])
  const [users,        setUsers]        = useState([])
  const [userProfiles, setUserProfiles] = useState([])
  const [sessions,     setSessions]     = useState([])   // {user_id, created_at, blueprint_url}
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState('')

  // ── Add company form ──────────────────────────────────────────────────────────
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyPlan, setNewCompanyPlan] = useState('basic')
  const [savingCompany,  setSavingCompany]  = useState(false)
  const [companyError,   setCompanyError]   = useState('')

  // ── Edit company name (inline) ────────────────────────────────────────────────
  const [editingNameId,    setEditingNameId]    = useState(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [savingNameId,     setSavingNameId]     = useState(null)

  // ── Company notes (inline) ────────────────────────────────────────────────────
  const [editingNotesId, setEditingNotesId] = useState(null)
  const [notesValue,     setNotesValue]     = useState('')
  const [savingNotesId,  setSavingNotesId]  = useState(null)

  // ── Delete company ────────────────────────────────────────────────────────────
  const [deletingCompanyId, setDeletingCompanyId] = useState(null)

  // ── Feature flag saving ───────────────────────────────────────────────────────
  const [savingFlags, setSavingFlags] = useState({})

  // ── Invite / create user form ─────────────────────────────────────────────────
  const [showAddUser,      setShowAddUser]      = useState(false)
  const [addUserMethod,    setAddUserMethod]    = useState('invite') // 'invite' | 'create'
  const [newUserEmail,     setNewUserEmail]     = useState('')
  const [newUserPassword,  setNewUserPassword]  = useState('')
  const [newUserCompanyId, setNewUserCompanyId] = useState('')
  const [savingUser,       setSavingUser]       = useState(false)
  const [userError,        setUserError]        = useState('')

  // ── Edit user company (inline) ────────────────────────────────────────────────
  const [editingCompanyUserId,  setEditingCompanyUserId]  = useState(null)
  const [editCompanyValue,      setEditCompanyValue]      = useState('')
  const [savingCompanyUserId,   setSavingCompanyUserId]   = useState(null)

  // ── User action feedback ──────────────────────────────────────────────────────
  const [deletingUserId,  setDeletingUserId]  = useState(null)
  const [resetSentId,     flashResetSent]     = useTempId()
  const [resendSentId,    flashResendSent]    = useTempId()

  // ── Set password (inline) ─────────────────────────────────────────────────────
  const [setPasswordUserId, setSetPasswordUserId] = useState(null)
  const [setPasswordValue,  setSetPasswordValue]  = useState('')
  const [setPasswordSaving, setSetPasswordSaving] = useState(false)
  const [setPasswordDoneId, flashSetPasswordDone] = useTempId()

  // ── Plan change ───────────────────────────────────────────────────────────────
  const [savingPlanId, setSavingPlanId] = useState(null)
  const [planSavedId,  flashPlanSaved]  = useTempId()

  // ── Row expansion ─────────────────────────────────────────────────────────────
  const [expandedCompanyId, setExpandedCompanyId] = useState(null)
  const [companyZoneCounts, setCompanyZoneCounts] = useState({}) // { [companyId]: number }
  const [loadingZoneCount,  setLoadingZoneCount]  = useState({}) // { [companyId]: bool }

  // ── Test logs ─────────────────────────────────────────────────────────────────
  const [testLogsOpen, setTestLogsOpen]       = useState(false)
  const [testLogs, setTestLogs]               = useState([])
  const [testLogsLoading, setTestLogsLoading] = useState(false)
  const [testVerdictFilter, setTestVerdictFilter] = useState('ALL')
  const [testCompanyFilter, setTestCompanyFilter] = useState('')
  const [expandedLogId, setExpandedLogId]     = useState(null)

  // ── Beta feedback (D2) ────────────────────────────────────────────────────────
  const [feedbackOpen, setFeedbackOpen]       = useState(false)
  const [feedbackItems, setFeedbackItems]     = useState([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState('all')
  const [feedbackTypeFilter, setFeedbackTypeFilter]     = useState('all')
  const [expandedFeedbackId, setExpandedFeedbackId]     = useState(null)
  const [feedbackEditNotes, setFeedbackEditNotes]       = useState('')
  const [feedbackEditStatus, setFeedbackEditStatus]     = useState('')

  // ── Client errors (D3) ────────────────────────────────────────────────────────
  const [errorsOpen, setErrorsOpen]           = useState(false)
  const [clientErrors, setClientErrors]       = useState([])
  const [errorsLoading, setErrorsLoading]     = useState(false)
  const [errorsDateFilter, setErrorsDateFilter] = useState('7d')
  const [expandedErrorId, setExpandedErrorId] = useState(null)

  // ── Storage usage (D4) ────────────────────────────────────────────────────────
  const [companyStorage, setCompanyStorage]   = useState({}) // { [companyId]: { totalBytes, fileCount } }
  const [storageLoading, setStorageLoading]   = useState({})

  // ── Seat override editing (D5) ─────────────────────────────────────────────────
  const [editingSeatId, setEditingSeatId]         = useState(null)
  const [editingSeatValue, setEditingSeatValue]   = useState('')
  const [savingSeatId, setSavingSeatId]           = useState(null)

  // ── Load all data ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [
        { data: companiesData, error: companiesErr },
        { data: profilesData,  error: profilesErr  },
        { data: sessionsData,  error: sessionsErr   },
      ] = await Promise.all([
        supabase.from('companies').select('*').order('created_at', { ascending: true }),
        supabase.from('user_profiles').select('*'),
        // Fetch created_at + blueprint_url so metrics can be computed client-side
        supabase.from('sessions').select('id, user_id, created_at, blueprint_url'),
      ])

      if (companiesErr) throw new Error('companies: ' + companiesErr.message)
      if (profilesErr)  throw new Error('user_profiles: ' + profilesErr.message)
      if (sessionsErr)  throw new Error('sessions: ' + sessionsErr.message)

      setCompanies(companiesData ?? [])
      setUserProfiles(profilesData ?? [])
      setSessions(sessionsData ?? [])

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list' },
      })
      if (fnErr) throw new Error('user list: ' + fnErr.message)
      setUsers(fnData?.users ?? [])

    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Derived: metrics ──────────────────────────────────────────────────────────
  const now = new Date()
  const sessionsThisMonth = sessions.filter(s => {
    const d = new Date(s.created_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
  const blueprintsUploaded = sessions.filter(s => !!s.blueprint_url).length

  // ── Derived: per-company helpers ──────────────────────────────────────────────
  function sessionCountFor(companyId) {
    const ids = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
    return sessions.filter(s => ids.includes(s.user_id)).length
  }

  function sessionsThisMonthFor(companyId) {
    const now = new Date()
    const ids = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
    return sessions.filter(s => {
      const d = new Date(s.created_at)
      return ids.includes(s.user_id) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth()    === now.getMonth()
    }).length
  }

  function companyNameFor(userId) {
    const profile = userProfiles.find(p => p.user_id === userId)
    if (!profile?.company_id) return '—'
    return companies.find(c => c.id === profile.company_id)?.name ?? '—'
  }

  function profileCompanyIdFor(userId) {
    return userProfiles.find(p => p.user_id === userId)?.company_id ?? ''
  }

  function roleFor(userId) {
    return userProfiles.find(p => p.user_id === userId)?.role ?? 'contractor_user'
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // COMPANY HANDLERS
  // ══════════════════════════════════════════════════════════════════════════════

  async function handleAddCompany(e) {
    e.preventDefault()
    if (!newCompanyName.trim()) return
    setSavingCompany(true)
    setCompanyError('')
    try {
      const plan       = newCompanyPlan
      const planConfig = PLANS.find(p => p.value === plan)
      const { data, error } = await supabase
        .from('companies')
        .insert({
          name:            newCompanyName.trim(),
          plan,
          blueprint_limit: planConfig?.limit ?? 10,
          features:        PLAN_FEATURES[plan] ?? {},
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      setCompanies(prev => [...prev, data])
      setNewCompanyName('')
      setNewCompanyPlan('basic')
      setShowAddCompany(false)
    } catch (err) {
      setCompanyError(err.message)
    } finally {
      setSavingCompany(false)
    }
  }

  // ── Edit company name ─────────────────────────────────────────────────────────
  function handleStartEditName(company) {
    setEditingNameId(company.id)
    setEditingNameValue(company.name)
  }

  async function handleSaveName(companyId) {
    const trimmed = editingNameValue.trim()
    if (!trimmed) return
    setSavingNameId(companyId)
    try {
      const { error } = await supabase
        .from('companies').update({ name: trimmed }).eq('id', companyId)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, name: trimmed } : c))
      setEditingNameId(null)
    } catch (err) {
      alert('Failed to save name: ' + err.message)
    } finally {
      setSavingNameId(null)
    }
  }

  // ── Company notes ─────────────────────────────────────────────────────────────
  function handleStartEditNotes(company) {
    setEditingNotesId(company.id)
    setNotesValue(company.notes ?? '')
  }

  async function handleSaveNotes(companyId) {
    setSavingNotesId(companyId)
    try {
      const { error } = await supabase
        .from('companies').update({ notes: notesValue.trim() || null }).eq('id', companyId)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.map(c =>
        c.id === companyId ? { ...c, notes: notesValue.trim() || null } : c
      ))
      setEditingNotesId(null)
    } catch (err) {
      alert('Failed to save notes: ' + err.message)
    } finally {
      setSavingNotesId(null)
    }
  }

  // ── Delete company ────────────────────────────────────────────────────────────
  async function handleDeleteCompany(company) {
    const confirmed = window.confirm(
      `Delete ${company.name}?\n\nThis will remove the company record. User accounts will not be deleted.`
    )
    if (!confirmed) return
    setDeletingCompanyId(company.id)
    try {
      const { error } = await supabase.from('companies').delete().eq('id', company.id)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.filter(c => c.id !== company.id))
      // ON DELETE SET NULL handles user_profiles in the DB; mirror it in local state
      setUserProfiles(prev => prev.map(p =>
        p.company_id === company.id ? { ...p, company_id: null } : p
      ))
    } catch (err) {
      alert('Failed to delete company: ' + err.message)
    } finally {
      setDeletingCompanyId(null)
    }
  }

  // ── Feature flags ─────────────────────────────────────────────────────────────
  async function handleToggleFlag(company, flagKey) {
    setSavingFlags(prev => ({ ...prev, [company.id]: true }))
    const current = company.features ?? {}
    const updated = { ...current, [flagKey]: !current[flagKey] }
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, features: updated } : c))
    try {
      const { error } = await supabase
        .from('companies').update({ features: updated }).eq('id', company.id)
      if (error) throw new Error(error.message)
    } catch (err) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, features: current } : c))
      alert('Failed to save: ' + err.message)
    } finally {
      setSavingFlags(prev => ({ ...prev, [company.id]: false }))
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // USER HANDLERS
  // ══════════════════════════════════════════════════════════════════════════════

  async function handleAddUser(e) {
    e.preventDefault()
    if (!newUserEmail.trim()) return
    if (addUserMethod === 'create' && !newUserPassword.trim()) {
      setUserError('Password is required.')
      return
    }
    setSavingUser(true)
    setUserError('')
    try {
      const body = addUserMethod === 'invite'
        ? { action: 'invite', email: newUserEmail.trim(), company_id: newUserCompanyId || null }
        : { action: 'create', email: newUserEmail.trim(), password: newUserPassword, company_id: newUserCompanyId || null }
      const { data, error } = await supabase.functions.invoke('admin-users', { body })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      await loadAll()
      setNewUserEmail('')
      setNewUserPassword('')
      setNewUserCompanyId('')
      setShowAddUser(false)
    } catch (err) {
      setUserError(err.message)
    } finally {
      setSavingUser(false)
    }
  }

  // ── Resend invitation ─────────────────────────────────────────────────────────
  async function handleResendInvite(user) {
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'resend', email: user.email },
    })
    if (error || data?.error) {
      alert('Failed to resend: ' + (data?.error ?? error?.message))
      return
    }
    flashResendSent(user.id)
  }

  // ── Edit user → company ───────────────────────────────────────────────────────
  function handleStartEditUserCompany(user) {
    setEditingCompanyUserId(user.id)
    setEditCompanyValue(profileCompanyIdFor(user.id))
  }

  async function handleSaveUserCompany(user) {
    // Seat limit check — uses effective seat limit (seat_limit_override ?? plan default)
    if (editCompanyValue) {
      const targetCompany = companies.find(c => c.id === editCompanyValue)
      if (targetCompany) {
        const currentCount = userProfiles.filter(p => p.company_id === editCompanyValue).length
        const seats = getEffectiveSeatLimit(targetCompany)
        if (seats != null && currentCount >= seats) {
          const ok = window.confirm(
            `This company has reached its seat limit of ${seats}. Add anyway as super admin override?`
          )
          if (!ok) { setSavingCompanyUserId(null); return }
        }
      }
    }

    setSavingCompanyUserId(user.id)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert(
          { user_id: user.id, company_id: editCompanyValue || null, email: user.email },
          { onConflict: 'user_id' }
        )
      if (error) throw new Error(error.message)
      setUserProfiles(prev => {
        const exists = prev.find(p => p.user_id === user.id)
        if (exists) {
          return prev.map(p =>
            p.user_id === user.id ? { ...p, company_id: editCompanyValue || null } : p
          )
        }
        return [...prev, { user_id: user.id, company_id: editCompanyValue || null, email: user.email }]
      })
      setEditingCompanyUserId(null)
    } catch (err) {
      alert('Failed to update company: ' + err.message)
    } finally {
      setSavingCompanyUserId(null)
    }
  }

  // ── Reset password ────────────────────────────────────────────────────────────
  async function handleResetPassword(user) {
    const confirmed = window.confirm(`Send a password reset email to ${user.email}?`)
    if (!confirmed) return
    const { error } = await supabase.auth.resetPasswordForEmail(user.email)
    if (error) { alert('Failed to send reset email: ' + error.message); return }
    flashResetSent(user.id)
  }

  // ── Delete user ───────────────────────────────────────────────────────────────
  async function handleDeleteUser(user) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${user.email}?\n\nThis permanently removes their account and cannot be undone.`
    )
    if (!confirmed) return
    setDeletingUserId(user.id)
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'delete', user_id: user.id },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      setUsers(prev => prev.filter(u => u.id !== user.id))
      setUserProfiles(prev => prev.filter(p => p.user_id !== user.id))
    } catch (err) {
      alert('Failed to delete user: ' + err.message)
    } finally {
      setDeletingUserId(null)
    }
  }

  // ── Change user role ───────────────────────────────────────────────────────
  async function handleChangeRole(userId, newRole) {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('user_id', userId)
      if (error) throw new Error(error.message)
      setUserProfiles(prev => prev.map(p =>
        p.user_id === userId ? { ...p, role: newRole } : p
      ))
    } catch (err) {
      alert('Failed to update role: ' + err.message)
    }
  }

  // ── Set password (inline) ────────────────────────────────────────────────────
  async function handleSetPassword(userId) {
    if (!setPasswordValue.trim()) return
    setSetPasswordSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'set_password', user_id: userId, new_password: setPasswordValue },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      flashSetPasswordDone(userId)
      setSetPasswordUserId(null)
      setSetPasswordValue('')
    } catch (err) {
      alert('Failed to set password: ' + err.message)
    } finally {
      setSetPasswordSaving(false)
    }
  }

  // ── Change company plan ───────────────────────────────────────────────────────
  // Updates plan, blueprint_limit, and features atomically.
  async function handleChangePlan(companyId, newPlan) {
    const planConfig = PLANS.find(p => p.value === newPlan)
    const newFeatures = PLAN_FEATURES[newPlan] ?? {}
    const newLimit    = planConfig?.limit ?? 10
    setSavingPlanId(companyId)
    // Optimistic update so the dropdown reflects the new value immediately
    setCompanies(prev => prev.map(c =>
      c.id === companyId
        ? { ...c, plan: newPlan, blueprint_limit: newLimit, features: newFeatures }
        : c
    ))
    try {
      const { error } = await supabase
        .from('companies')
        .update({ plan: newPlan, blueprint_limit: newLimit, features: newFeatures })
        .eq('id', companyId)
      if (error) throw new Error(error.message)
      flashPlanSaved(companyId)
    } catch (err) {
      alert('Failed to update plan: ' + err.message)
      // Reload to restore accurate state
      await loadAll()
    } finally {
      setSavingPlanId(null)
    }
  }

  // ── Toggle company row expansion ──────────────────────────────────────────────
  async function handleToggleExpand(companyId) {
    // Collapse if already open
    if (expandedCompanyId === companyId) {
      setExpandedCompanyId(null)
      return
    }
    setExpandedCompanyId(companyId)

    // Don't re-fetch if we already have the count
    if (companyZoneCounts[companyId] !== undefined) return

    setLoadingZoneCount(prev => ({ ...prev, [companyId]: true }))
    try {
      const userIds = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
      const now        = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      // Find sessions this month belonging to this company's users (IDs available now)
      const thisMonthSessionIds = sessions
        .filter(s => userIds.includes(s.user_id) && s.created_at >= monthStart)
        .map(s => s.id)
        .filter(Boolean)

      let zoneCount = 0
      if (thisMonthSessionIds.length > 0) {
        const { count } = await supabase
          .from('zones')
          .select('id', { count: 'exact', head: true })
          .in('session_id', thisMonthSessionIds)
        zoneCount = count ?? 0
      }
      setCompanyZoneCounts(prev => ({ ...prev, [companyId]: zoneCount }))
    } finally {
      setLoadingZoneCount(prev => ({ ...prev, [companyId]: false }))
    }
  }

  // ── Load test logs (on demand) ────────────────────────────────────────────────
  async function handleToggleTestLogs() {
    if (testLogsOpen) { setTestLogsOpen(false); return }
    setTestLogsOpen(true)
    if (testLogs.length > 0) return // already loaded
    setTestLogsLoading(true)
    try {
      const { data, error } = await supabase
        .from('session_test_logs')
        .select('*, sessions(project_name, client_name)')
        .order('logged_at', { ascending: false })
        .limit(500)
      if (error) throw new Error(error.message)
      setTestLogs(data ?? [])
    } catch (err) {
      alert('Failed to load test logs: ' + err.message)
    } finally {
      setTestLogsLoading(false)
    }
  }

  // ── Load beta feedback (on demand) ─────────────────────────────────────────────
  async function handleToggleFeedback() {
    if (feedbackOpen) { setFeedbackOpen(false); return }
    setFeedbackOpen(true)
    if (feedbackItems.length > 0) return
    setFeedbackLoading(true)
    try {
      const { data, error } = await supabase
        .from('beta_feedback')
        .select('id, tenant_id, user_id, session_id, type, description, screenshot_url, page_url, user_agent, status, admin_notes, created_at')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw new Error(error.message)
      setFeedbackItems(data ?? [])
    } catch (err) {
      alert('Failed to load feedback: ' + err.message)
    } finally {
      setFeedbackLoading(false)
    }
  }

  async function handleUpdateFeedback(id) {
    try {
      const { error } = await supabase
        .from('beta_feedback')
        .update({ status: feedbackEditStatus, admin_notes: feedbackEditNotes })
        .eq('id', id)
      if (error) throw new Error(error.message)
      setFeedbackItems(prev => prev.map(f =>
        f.id === id ? { ...f, status: feedbackEditStatus, admin_notes: feedbackEditNotes } : f
      ))
      setExpandedFeedbackId(null)
    } catch (err) {
      alert('Failed to update feedback: ' + err.message)
    }
  }

  // ── Load client errors (on demand) ────────────────────────────────────────────
  async function handleToggleErrors() {
    if (errorsOpen) { setErrorsOpen(false); return }
    setErrorsOpen(true)
    if (clientErrors.length > 0) return
    setErrorsLoading(true)
    try {
      const { data, error } = await supabase
        .from('client_errors')
        .select('id, tenant_id, user_id, error_message, stack_trace, component_stack, page_url, created_at')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw new Error(error.message)
      setClientErrors(data ?? [])
    } catch (err) {
      alert('Failed to load errors: ' + err.message)
    } finally {
      setErrorsLoading(false)
    }
  }

  // ── Storage usage per company ─────────────────────────────────────────────────
  async function fetchCompanyStorage(companyId) {
    if (storageLoading[companyId] || companyStorage[companyId]) return
    setStorageLoading(prev => ({ ...prev, [companyId]: true }))
    try {
      const companyUserIds = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
      let totalBytes = 0
      let fileCount = 0
      for (const userId of companyUserIds) {
        const { data: files } = await supabase.storage.from('blueprints').list(userId, { limit: 1000 })
        if (files) {
          for (const folder of files) {
            const { data: innerFiles } = await supabase.storage.from('blueprints').list(`${userId}/${folder.name}`, { limit: 1000 })
            if (innerFiles) {
              for (const f of innerFiles) {
                totalBytes += f.metadata?.size ?? 0
                fileCount++
              }
            }
          }
        }
      }
      setCompanyStorage(prev => ({ ...prev, [companyId]: { totalBytes, fileCount } }))
    } catch {
      // silently fail
    } finally {
      setStorageLoading(prev => ({ ...prev, [companyId]: false }))
    }
  }

  // ── Seat override (D5) ────────────────────────────────────────────────────────
  function getEffectiveSeatLimit(company) {
    if (company.seat_limit_override != null) return company.seat_limit_override
    return PLAN_FEATURES[company.plan]?.seat_limit ?? 1
  }

  function handleStartEditSeat(company) {
    setEditingSeatId(company.id)
    setEditingSeatValue(company.seat_limit_override != null ? String(company.seat_limit_override) : '')
  }

  async function handleSaveSeat(companyId) {
    const val = editingSeatValue.trim()
    const override = val === '' ? null : parseInt(val, 10)
    if (val !== '' && (isNaN(override) || override < 1)) {
      alert('Seat limit must be a positive number or empty for plan default.')
      return
    }
    setSavingSeatId(companyId)
    try {
      const { error } = await supabase
        .from('companies').update({ seat_limit_override: override }).eq('id', companyId)
      if (error) throw new Error(error.message)
      setCompanies(prev => prev.map(c =>
        c.id === companyId ? { ...c, seat_limit_override: override } : c
      ))
      setEditingSeatId(null)
    } catch (err) {
      alert('Failed to save seat limit: ' + err.message)
    } finally {
      setSavingSeatId(null)
    }
  }

  // ── Export users CSV (D6) ──────────────────────────────────────────────────────
  function handleExportUsersCSV() {
    const rows = [['ID', 'Email', 'Full Name', 'Phone', 'Company Name', 'Plan', 'Role', 'Status', 'Created At', 'Last Sign In At']]
    users.forEach(u => {
      const profile = userProfiles.find(p => p.user_id === u.id)
      const company = profile?.company_id ? companies.find(c => c.id === profile.company_id) : null
      rows.push([
        u.id,
        u.email ?? '',
        profile?.full_name ?? '',
        profile?.phone ?? '',
        company?.name ?? '',
        company?.plan ?? '',
        profile?.role ?? 'contractor_user',
        u.last_sign_in_at ? 'active' : 'pending',
        u.created_at ?? '',
        u.last_sign_in_at ?? '',
      ])
    })
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const dateStr = new Date().toISOString().slice(0, 10)
    a.download = `blueprintmeasure_users_${dateStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Loading screen ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <div className={styles.spinner} />
          Loading admin data…
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>📐 BlueprintMeasure</span>
          <span className={styles.adminBadge}>Super Admin</span>
        </div>
        <div className={styles.headerRight}>
          <Link to="/accuracy-test" className={styles.testLink}>🧪 Accuracy Test</Link>
          <Link to="/dashboard" className={styles.backLink}>← Back to Dashboard</Link>
        </div>
      </header>

      <main className={styles.content}>

        {/* ══════════════════════════════════════════════════════════
            PLATFORM METRICS BAR
        ══════════════════════════════════════════════════════════ */}
        <div className={styles.metricsBar}>
          <div className={styles.metricCard}>
            <div className={styles.metricValue}>{companies.length}</div>
            <div className={styles.metricLabel}>Total Companies</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricValue}>{users.length}</div>
            <div className={styles.metricLabel}>Total Users</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricValue}>{sessionsThisMonth}</div>
            <div className={styles.metricLabel}>Sessions This Month</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricValue}>{blueprintsUploaded}</div>
            <div className={styles.metricLabel}>Blueprints Uploaded</div>
          </div>
        </div>

        {loadError && (
          <div className={styles.errorBox}>
            <strong>Error loading data:</strong> {loadError}
            {loadError.includes('user list') && (
              <p style={{ marginTop: 8 }}>
                The <code>admin-users</code> Edge Function may not be deployed yet.
              </p>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            SECTION 1 — Companies
        ══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Companies
              <span className={styles.pill}>{companies.length}</span>
            </h2>
            <button
              className={styles.addBtn}
              onClick={() => { setShowAddCompany(v => !v); setCompanyError('') }}
            >
              {showAddCompany ? 'Cancel' : '+ Add Company'}
            </button>
          </div>

          {showAddCompany && (
            <form className={styles.form} onSubmit={handleAddCompany}>
              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Company Name</label>
                  <input
                    className={styles.formInput}
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    placeholder="e.g. Coastal Coat & Paint"
                    required
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Plan</label>
                  <select
                    className={styles.formSelect}
                    value={newCompanyPlan}
                    onChange={e => setNewCompanyPlan(e.target.value)}
                  >
                    {PLANS.map(p => (
                      <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>
                    ))}
                  </select>
                </div>
              </div>
              {companyError && <p className={styles.fieldError}>{companyError}</p>}
              <div className={styles.formActions}>
                <button type="submit" className={styles.submitBtn} disabled={savingCompany}>
                  {savingCompany ? 'Creating…' : 'Create Company'}
                </button>
              </div>
            </form>
          )}

          {companies.length === 0 ? (
            <p className={styles.empty}>No companies yet — add one above.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Company</th>
                    <th className={styles.th}>Plan</th>
                    <th className={styles.th}>Seats</th>
                    <th className={styles.th}>Storage Used</th>
                    <th className={styles.th}>Usage / Month</th>
                    <th className={styles.th}>Feature Flags</th>
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(company => {
                    const flags           = company.features ?? {}
                    const isSaving        = !!savingFlags[company.id]
                    const isEditingName   = editingNameId === company.id
                    const isEditingNotes  = editingNotesId === company.id
                    const isExpanded      = expandedCompanyId === company.id
                    const companyUserIds  = userProfiles.filter(p => p.company_id === company.id).map(p => p.user_id)
                    const companyUsers    = users.filter(u => companyUserIds.includes(u.id))

                    return (
                      <Fragment key={company.id}>
                      {/* ── Main row — click outside interactive elements to expand ── */}
                      <tr
                        className={`${styles.tr} ${isExpanded ? styles.trExpanded : ''}`}
                        onClick={e => {
                          if (e.target.closest('[data-no-expand]')) return
                          handleToggleExpand(company.id)
                        }}
                        style={{ cursor: 'pointer' }}
                      >

                        {/* ── Company name + notes ── */}
                        <td className={styles.td}>
                          <div className={styles.companyExpandRow}>
                            <span className={styles.expandChevron}>
                              {isExpanded ? '▾' : '▸'}
                            </span>
                            <div data-no-expand>
                              {isEditingName ? (
                                <div className={styles.inlineEdit}>
                                  <input
                                    className={styles.inlineInput}
                                    value={editingNameValue}
                                    onChange={e => setEditingNameValue(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveName(company.id)
                                      if (e.key === 'Escape') setEditingNameId(null)
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    className={styles.inlineSaveBtn}
                                    onClick={() => handleSaveName(company.id)}
                                    disabled={savingNameId === company.id}
                                  >
                                    {savingNameId === company.id ? '…' : 'Save'}
                                  </button>
                                  <button
                                    className={styles.inlineCancelBtn}
                                    onClick={() => setEditingNameId(null)}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className={styles.companyNameRow}>
                                  <span className={styles.companyNameText}>{company.name}</span>
                                  <button
                                    className={styles.iconBtn}
                                    onClick={() => handleStartEditName(company)}
                                    title="Edit name"
                                  >
                                    ✎
                                  </button>
                                </div>
                              )}

                              {/* Notes */}
                              {isEditingNotes ? (
                                <div className={styles.notesEditArea}>
                                  <textarea
                                    className={styles.notesTextarea}
                                    value={notesValue}
                                    onChange={e => setNotesValue(e.target.value)}
                                    rows={2}
                                    placeholder="Add notes…"
                                    autoFocus
                                  />
                                  <div className={styles.notesActions}>
                                    <button
                                      className={styles.inlineSaveBtn}
                                      onClick={() => handleSaveNotes(company.id)}
                                      disabled={savingNotesId === company.id}
                                    >
                                      {savingNotesId === company.id ? 'Saving…' : 'Save'}
                                    </button>
                                    <button
                                      className={styles.inlineCancelBtn}
                                      onClick={() => setEditingNotesId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  className={styles.notesBtn}
                                  onClick={() => handleStartEditNotes(company)}
                                >
                                  {company.notes
                                    ? company.notes
                                    : <span className={styles.notesPlaceholder}>+ Add notes</span>
                                  }
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* ── Plan — inline select ── */}
                        <td className={styles.td}>
                          <div className={styles.planCell} data-no-expand>
                            <select
                              className={styles.planSelect}
                              value={company.plan}
                              onChange={e => handleChangePlan(company.id, e.target.value)}
                              disabled={savingPlanId === company.id}
                            >
                              {PLANS.map(p => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                              ))}
                            </select>
                            {planSavedId === company.id
                              ? <span className={styles.planSaved}>✓ Saved</span>
                              : <span className={styles.planDesc}>
                                  {PLANS.find(p => p.value === company.plan)?.desc ?? ''}
                                </span>
                            }
                          </div>
                        </td>

                        {/* ── Seats (D5 — inline editable) ── */}
                        <td className={styles.td} data-no-expand>
                          {editingSeatId === company.id ? (
                            <div className={styles.inlineEdit}>
                              <input
                                type="number"
                                min="1"
                                className={styles.inlineInput}
                                style={{ width: 60 }}
                                value={editingSeatValue}
                                onChange={e => setEditingSeatValue(e.target.value)}
                                placeholder={String(PLAN_FEATURES[company.plan]?.seat_limit ?? 1)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveSeat(company.id)
                                  if (e.key === 'Escape') setEditingSeatId(null)
                                }}
                                autoFocus
                              />
                              <button
                                className={styles.inlineSaveBtn}
                                onClick={() => handleSaveSeat(company.id)}
                                disabled={savingSeatId === company.id}
                              >
                                {savingSeatId === company.id ? '…' : 'Save'}
                              </button>
                              <button
                                className={styles.inlineCancelBtn}
                                onClick={() => setEditingSeatId(null)}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className={styles.usageCell}>
                              <span className={styles.usageCount}>
                                {companyUsers.length} / {getEffectiveSeatLimit(company) ?? '∞'}
                              </span>
                              <span className={styles.seatBadge}>
                                {company.seat_limit_override != null ? '(custom)' : '(plan default)'}
                              </span>
                              <button
                                className={styles.iconBtn}
                                onClick={() => handleStartEditSeat(company)}
                                title="Edit seat limit"
                              >
                                ✎
                              </button>
                              {getEffectiveSeatLimit(company) != null && companyUsers.length >= getEffectiveSeatLimit(company) && (
                                <span className={styles.seatWarning}>At limit</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* ── Storage Used (D4) ── */}
                        <td className={styles.td}>
                          {(() => {
                            const stor = companyStorage[company.id]
                            const limitMb = PLAN_FEATURES[company.plan]?.storage_limit_mb
                            if (!stor && !storageLoading[company.id]) {
                              return <button className={styles.iconBtn} onClick={() => fetchCompanyStorage(company.id)} title="Load storage">Load</button>
                            }
                            if (storageLoading[company.id]) return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Loading…</span>
                            const usedGb = (stor.totalBytes / (1024 * 1024 * 1024)).toFixed(1)
                            const limitGb = limitMb != null ? (limitMb / 1024).toFixed(0) : '∞'
                            const pct = limitMb != null ? (stor.totalBytes / (limitMb * 1024 * 1024)) * 100 : 0
                            const barColor = pct > 95 ? '#ef4444' : pct > 75 ? '#f59e0b' : 'var(--color-primary)'
                            return (
                              <div className={styles.usageCell}>
                                <span className={styles.usageCount}>{usedGb} GB / {limitGb} GB</span>
                                {limitMb != null && (
                                  <div className={styles.miniBarTrack}>
                                    <div className={styles.miniBarFill} style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </td>

                        {/* ── Usage this month ── */}
                        <td className={styles.td}>
                          <div className={styles.usageCell}>
                            <span className={styles.usageCount}>
                              {sessionsThisMonthFor(company.id)} / {company.blueprint_limit ?? '∞'}
                            </span>
                            <span className={styles.usageLabel}>blueprints this month</span>
                          </div>
                        </td>

                        {/* ── Feature flags ── */}
                        <td className={styles.td}>
                          <div className={styles.flagGroup} data-no-expand>
                            {FEATURES.map(({ key, label }) => {
                              const on = !!flags[key]
                              return (
                                <label key={key} className={styles.flagRow}>
                                  <input
                                    type="checkbox"
                                    className={styles.flagCheck}
                                    checked={on}
                                    onChange={() => handleToggleFlag(company, key)}
                                    disabled={isSaving}
                                  />
                                  <span className={on ? styles.flagLabelOn : styles.flagLabel}>
                                    {label}
                                  </span>
                                  {on && <span className={styles.flagOnBadge}>ON</span>}
                                </label>
                              )
                            })}
                          </div>
                        </td>

                        {/* ── Delete ── */}
                        <td className={styles.tdAction} data-no-expand>
                          <button
                            className={styles.deleteUserBtn}
                            onClick={() => handleDeleteCompany(company)}
                            disabled={deletingCompanyId === company.id}
                          >
                            {deletingCompanyId === company.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </td>
                      </tr>

                      {/* ── Expansion panel ── */}
                      {isExpanded && (
                        <tr className={styles.expandedRow}>
                          <td colSpan={7} className={styles.expandedCell}>
                            <div className={styles.expandedPanel}>

                              {/* Activity stats */}
                              <div className={styles.expandedSection}>
                                <div className={styles.expandedSectionTitle}>Activity</div>
                                <div className={styles.expandedStats}>
                                  <div className={styles.expandedStat}>
                                    <span className={styles.expandedStatNum}>
                                      {sessionsThisMonthFor(company.id)}
                                    </span>
                                    <span className={styles.expandedStatLabel}>sessions this month</span>
                                  </div>
                                  <div className={styles.expandedStat}>
                                    <span className={styles.expandedStatNum}>
                                      {sessionCountFor(company.id)}
                                    </span>
                                    <span className={styles.expandedStatLabel}>sessions all time</span>
                                  </div>
                                  <div className={styles.expandedStat}>
                                    <span className={styles.expandedStatNum}>
                                      {loadingZoneCount[company.id]
                                        ? '…'
                                        : (companyZoneCounts[company.id] ?? 0)}
                                    </span>
                                    <span className={styles.expandedStatLabel}>zones added this month</span>
                                  </div>
                                </div>
                              </div>

                              {/* Users */}
                              <div className={styles.expandedSection}>
                                <div className={styles.expandedSectionTitle}>
                                  Users ({companyUsers.length})
                                </div>
                                {companyUsers.length === 0 ? (
                                  <p className={styles.expandedEmpty}>No users assigned to this company.</p>
                                ) : (
                                  <table className={styles.expandedTable}>
                                    <thead>
                                      <tr>
                                        <th className={styles.expandedTh}>Email</th>
                                        <th className={styles.expandedTh}>Last login</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {companyUsers.map(u => (
                                        <tr key={u.id}>
                                          <td className={styles.expandedTd}>{u.email}</td>
                                          <td className={styles.expandedTd}>
                                            {u.last_sign_in_at
                                              ? new Date(u.last_sign_in_at).toLocaleDateString('en-US', {
                                                  month: 'short', day: 'numeric', year: 'numeric',
                                                })
                                              : <span className={styles.expandedNever}>Never logged in</span>
                                            }
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>

                              {/* Feature flags readable summary */}
                              <div className={styles.expandedSection}>
                                <div className={styles.expandedSectionTitle}>Feature Flags</div>
                                <div className={styles.expandedFlags}>
                                  {FEATURES.map(f => (
                                    <div
                                      key={f.key}
                                      className={flags[f.key] ? styles.expandedFlagOn : styles.expandedFlagOff}
                                    >
                                      <span className={styles.expandedFlagDot} />
                                      {f.label}
                                    </div>
                                  ))}
                                </div>
                              </div>

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
        </section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 2 — Users
        ══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Users
              <span className={styles.pill}>{users.length}</span>
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.addBtn} onClick={handleExportUsersCSV}>
                Export Users CSV
              </button>
              <button
                className={styles.addBtn}
                onClick={() => { setShowAddUser(v => !v); setUserError('') }}
              >
                {showAddUser ? 'Cancel' : '+ Invite User'}
              </button>
            </div>
          </div>

          {showAddUser && (
            <form className={styles.form} onSubmit={handleAddUser}>
              {/* ── Method toggle ── */}
              <div className={styles.methodToggle}>
                <button
                  type="button"
                  className={addUserMethod === 'invite' ? styles.methodBtnActive : styles.methodBtn}
                  onClick={() => { setAddUserMethod('invite'); setUserError('') }}
                >
                  Send invitation email
                </button>
                <button
                  type="button"
                  className={addUserMethod === 'create' ? styles.methodBtnActive : styles.methodBtn}
                  onClick={() => { setAddUserMethod('create'); setUserError('') }}
                >
                  Set temporary password
                </button>
              </div>

              <p className={styles.formHint}>
                {addUserMethod === 'invite'
                  ? 'An invitation email will be sent. The user sets their own password when they accept.'
                  : 'The account is created immediately. The user must change the temporary password on first login.'}
              </p>

              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Email</label>
                  <input
                    type="email"
                    className={styles.formInput}
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    placeholder="contractor@company.com"
                    required
                  />
                </div>

                {addUserMethod === 'create' && (
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Temporary Password</label>
                    <input
                      type="password"
                      className={styles.formInput}
                      value={newUserPassword}
                      onChange={e => setNewUserPassword(e.target.value)}
                      placeholder="Temporary password"
                      required
                    />
                  </div>
                )}

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Company</label>
                  <select
                    className={styles.formSelect}
                    value={newUserCompanyId}
                    onChange={e => setNewUserCompanyId(e.target.value)}
                  >
                    <option value="">— No company —</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {userError && <p className={styles.fieldError}>{userError}</p>}
              <div className={styles.formActions}>
                <button type="submit" className={styles.submitBtn} disabled={savingUser}>
                  {savingUser
                    ? (addUserMethod === 'invite' ? 'Sending invite…' : 'Creating user…')
                    : (addUserMethod === 'invite' ? 'Send Invitation' : 'Create User')}
                </button>
              </div>
            </form>
          )}

          {users.length === 0 ? (
            <p className={styles.empty}>
              {loadError.includes('user list')
                ? 'Could not load users — deploy the Edge Function first.'
                : 'No users found.'}
            </p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Email</th>
                    <th className={styles.th}>Company</th>
                    <th className={styles.th}>Role</th>
                    <th className={styles.th}>Created</th>
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const isEditingCo = editingCompanyUserId === u.id
                    const neverLoggedIn = !u.last_sign_in_at
                    const isSettingPw = setPasswordUserId === u.id
                    return (
                      <Fragment key={u.id}>
                      <tr className={styles.tr}>

                        {/* ── Email ── */}
                        <td className={styles.td}>
                          <div className={styles.emailCell}>
                            {u.email}
                            {neverLoggedIn && (
                              <span className={styles.pendingBadge}>Pending</span>
                            )}
                          </div>
                        </td>

                        {/* ── Company (inline edit) ── */}
                        <td className={styles.td}>
                          {isEditingCo ? (
                            <div className={styles.inlineEdit}>
                              <select
                                className={styles.inlineSelect}
                                value={editCompanyValue}
                                onChange={e => setEditCompanyValue(e.target.value)}
                                autoFocus
                              >
                                <option value="">— No company —</option>
                                {companies.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                              <button
                                className={styles.inlineSaveBtn}
                                onClick={() => handleSaveUserCompany(u)}
                                disabled={savingCompanyUserId === u.id}
                              >
                                {savingCompanyUserId === u.id ? '…' : 'Save'}
                              </button>
                              <button
                                className={styles.inlineCancelBtn}
                                onClick={() => setEditingCompanyUserId(null)}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className={styles.companyNameRow}>
                              <span>{companyNameFor(u.id)}</span>
                              <button
                                className={styles.iconBtn}
                                onClick={() => handleStartEditUserCompany(u)}
                                title="Change company"
                              >
                                ✎
                              </button>
                            </div>
                          )}
                        </td>

                        {/* ── Role ── */}
                        <td className={styles.td}>
                          <select
                            className={styles.roleSelect}
                            value={roleFor(u.id)}
                            onChange={e => handleChangeRole(u.id, e.target.value)}
                          >
                            <option value="contractor_user">User</option>
                            <option value="contractor_admin">Admin</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                        </td>

                        {/* ─��� Created ── */}
                        <td className={styles.td}>
                          {new Date(u.created_at).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </td>

                        {/* ─�� Actions ── */}
                        <td className={styles.tdAction}>
                          {/* Resend — only for users who've never logged in */}
                          {resendSentId === u.id && (
                            <span className={styles.resetSent}>Sent!</span>
                          )}
                          {neverLoggedIn && (
                            <button
                              className={styles.resendBtn}
                              onClick={() => handleResendInvite(u)}
                              disabled={resendSentId === u.id}
                            >
                              Resend
                            </button>
                          )}

                          {/* Set password */}
                          {setPasswordDoneId === u.id && (
                            <span className={styles.resetSent}>Password updated!</span>
                          )}
                          <button
                            className={styles.setPasswordBtn}
                            onClick={() => {
                              if (isSettingPw) {
                                setSetPasswordUserId(null)
                                setSetPasswordValue('')
                              } else {
                                setSetPasswordUserId(u.id)
                                setSetPasswordValue('')
                              }
                            }}
                          >
                            {isSettingPw ? 'Cancel' : 'Set Password'}
                          </button>

                          {/* Reset password */}
                          {resetSentId === u.id && (
                            <span className={styles.resetSent}>Email sent!</span>
                          )}
                          <button
                            className={styles.resetBtn}
                            onClick={() => handleResetPassword(u)}
                            disabled={resetSentId === u.id}
                          >
                            Reset password
                          </button>

                          {/* Delete */}
                          <button
                            className={styles.deleteUserBtn}
                            onClick={() => handleDeleteUser(u)}
                            disabled={deletingUserId === u.id}
                          >
                            {deletingUserId === u.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </td>
                      </tr>

                      {/* ── Inline set-password form row ── */}
                      {isSettingPw && (
                        <tr className={styles.setPasswordRow}>
                          <td colSpan={5} className={styles.setPasswordCell}>
                            <div className={styles.setPasswordForm}>
                              <input
                                type="password"
                                className={styles.setPasswordInput}
                                value={setPasswordValue}
                                onChange={e => setSetPasswordValue(e.target.value)}
                                placeholder="New temporary password"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); handleSetPassword(u.id) }
                                  if (e.key === 'Escape') { setSetPasswordUserId(null); setSetPasswordValue('') }
                                }}
                              />
                              <button
                                className={styles.setPasswordSaveBtn}
                                onClick={() => handleSetPassword(u.id)}
                                disabled={setPasswordSaving || !setPasswordValue.trim()}
                              >
                                {setPasswordSaving ? 'Saving…' : 'Save'}
                              </button>
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
        </section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 3 — Test Logs
        ══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Test Logs
              {testLogs.length > 0 && <span className={styles.pill}>{testLogs.length}</span>}
            </h2>
            <button className={styles.addBtn} onClick={handleToggleTestLogs}>
              {testLogsOpen ? 'Close' : 'View Logs'}
            </button>
          </div>

          {testLogsOpen && (
            <>
              {testLogsLoading ? (
                <p className={styles.empty}>Loading test logs…</p>
              ) : testLogs.length === 0 ? (
                <p className={styles.empty}>No test logs yet.</p>
              ) : (
                <>
                  <div className={styles.testLogFilters}>
                    <select className={styles.testLogSelect}
                      value={testVerdictFilter} onChange={e => setTestVerdictFilter(e.target.value)}>
                      <option value="ALL">All verdicts</option>
                      <option value="PASS">PASS only</option>
                      <option value="FAIL">FAIL only</option>
                    </select>
                    <select className={styles.testLogSelect}
                      value={testCompanyFilter} onChange={e => setTestCompanyFilter(e.target.value)}>
                      <option value="">All companies</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button className={styles.testLogPrintBtn} onClick={() => window.print()}>
                      Print Logs
                    </button>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Date</th>
                          <th className={styles.th}>User</th>
                          <th className={styles.th}>Session</th>
                          <th className={styles.th}>Zone</th>
                          <th className={styles.th}>Type</th>
                          <th className={styles.th}>Stated</th>
                          <th className={styles.th}>Measured</th>
                          <th className={styles.th}>Variance</th>
                          <th className={styles.th}>Verdict</th>
                          <th className={styles.th}>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {testLogs
                          .filter(l => testVerdictFilter === 'ALL' || l.verdict === testVerdictFilter)
                          .filter(l => !testCompanyFilter || l.company_id === testCompanyFilter)
                          .map(log => {
                            const userEmail = users.find(u => u.id === log.user_id)?.email ?? '—'
                            const sessionLabel = log.sessions
                              ? `${log.sessions.client_name ?? ''} / ${log.sessions.project_name ?? ''}`
                              : '—'
                            const stated = log.stated_sf ?? log.stated_lf ?? '—'
                            const isExpanded = expandedLogId === log.id
                            return (
                              <Fragment key={log.id}>
                                <tr className={styles.tr} onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                  style={{ cursor: 'pointer' }}>
                                  <td className={styles.td}>{new Date(log.logged_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className={styles.td}>{userEmail}</td>
                                  <td className={styles.td}>{sessionLabel}</td>
                                  <td className={styles.td}>{log.zone_name}</td>
                                  <td className={styles.td}>{log.measurement_type}</td>
                                  <td className={styles.td}>{typeof stated === 'number' ? stated.toFixed(2) : stated}</td>
                                  <td className={styles.td}>{log.measured_value?.toFixed(2) ?? '—'}</td>
                                  <td className={styles.td}>{log.variance != null ? `${log.variance > 0 ? '+' : ''}${log.variance.toFixed(2)}` : '—'}</td>
                                  <td className={styles.td}>
                                    <span className={styles.testLogVerdict} style={{
                                      color: log.verdict === 'PASS' ? '#22c55e' : '#ef4444',
                                      background: log.verdict === 'PASS' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                    }}>{log.verdict}</span>
                                  </td>
                                  <td className={styles.td} style={{ color: '#ef4444', fontSize: '11px' }}>{log.error_code ?? ''}</td>
                                </tr>
                                {isExpanded && (
                                  <tr className={styles.expandedRow}>
                                    <td colSpan={10} className={styles.expandedCell}>
                                      <div className={styles.testLogDetail}>
                                        {log.error_message && <div><strong>Error:</strong> {log.error_message}</div>}
                                        {log.stated_segments && Array.isArray(log.stated_segments) ? (
                                          <div>
                                            <strong>Segments:</strong>
                                            {log.stated_segments.map((s, i) => (
                                              <div key={i} style={{ marginLeft: 8, fontSize: '11px' }}>
                                                {s.label || `Segment ${i + 1}`}:
                                                {s.mode === 'direct' || s.lf != null
                                                  ? ` ${s.sf != null ? s.sf + ' sf' : s.lf + ' lf'}`
                                                  : ` ${s.width}' × ${s.depth}' = ${s.sf} sf`}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          log.stated_width && <div>Width: {log.stated_width} ft · Depth: {log.stated_depth} ft</div>
                                        )}
                                        {log.variance_pct != null && <div>Variance: {log.variance_pct}%</div>}
                                        {log.notes && <div><strong>Notes:</strong> {log.notes}</div>}
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
                </>
              )}
            </>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 4 — Beta Feedback (D2 — super admin only)
        ══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Beta Feedback
              {feedbackItems.length > 0 && <span className={styles.pill}>{feedbackItems.length}</span>}
            </h2>
            <button className={styles.addBtn} onClick={handleToggleFeedback}>
              {feedbackOpen ? 'Close' : 'View Feedback'}
            </button>
          </div>

          {feedbackOpen && (
            <>
              {feedbackLoading ? (
                <p className={styles.empty}>Loading feedback…</p>
              ) : feedbackItems.length === 0 ? (
                <p className={styles.empty}>No feedback yet.</p>
              ) : (
                <>
                  <div className={styles.testLogFilters}>
                    <select className={styles.testLogSelect}
                      value={feedbackStatusFilter} onChange={e => setFeedbackStatusFilter(e.target.value)}>
                      <option value="all">All statuses</option>
                      <option value="new">New</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="wontfix">Won't Fix</option>
                    </select>
                    <select className={styles.testLogSelect}
                      value={feedbackTypeFilter} onChange={e => setFeedbackTypeFilter(e.target.value)}>
                      <option value="all">All types</option>
                      <option value="bug">Bug</option>
                      <option value="feature">Feature Request</option>
                      <option value="question">Question</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Created</th>
                          <th className={styles.th}>Type</th>
                          <th className={styles.th}>User</th>
                          <th className={styles.th}>Company</th>
                          <th className={styles.th}>Description</th>
                          <th className={styles.th}>Status</th>
                          <th className={styles.th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feedbackItems
                          .filter(f => feedbackStatusFilter === 'all' || f.status === feedbackStatusFilter)
                          .filter(f => feedbackTypeFilter === 'all' || f.type === feedbackTypeFilter)
                          .map(fb => {
                            const fbUser = users.find(u => u.id === fb.user_id)?.email ?? '—'
                            const fbCompany = fb.tenant_id ? companies.find(c => c.id === fb.tenant_id)?.name ?? '—' : '—'
                            const isExpFb = expandedFeedbackId === fb.id
                            return (
                              <Fragment key={fb.id}>
                                <tr className={styles.tr} onClick={() => {
                                  if (isExpFb) { setExpandedFeedbackId(null) } else {
                                    setExpandedFeedbackId(fb.id)
                                    setFeedbackEditStatus(fb.status ?? 'new')
                                    setFeedbackEditNotes(fb.admin_notes ?? '')
                                  }
                                }} style={{ cursor: 'pointer' }}>
                                  <td className={styles.td}>{new Date(fb.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className={styles.td}>{fb.type}</td>
                                  <td className={styles.td}>{fbUser}</td>
                                  <td className={styles.td}>{fbCompany}</td>
                                  <td className={styles.td} title={fb.description}>{fb.description?.length > 60 ? fb.description.slice(0, 60) + '…' : fb.description}</td>
                                  <td className={styles.td}><span className={styles.feedbackStatus}>{fb.status ?? 'new'}</span></td>
                                  <td className={styles.td}><button className={styles.iconBtn}>{isExpFb ? '▾' : '▸'}</button></td>
                                </tr>
                                {isExpFb && (
                                  <tr className={styles.expandedRow}>
                                    <td colSpan={7} className={styles.expandedCell}>
                                      <div className={styles.expandedPanel}>
                                        <div><strong>Full description:</strong> {fb.description}</div>
                                        <div><strong>Page URL:</strong> {fb.page_url}</div>
                                        {fb.screenshot_url && (
                                          <div><strong>Screenshot:</strong> <a href={fb.screenshot_url} target="_blank" rel="noopener noreferrer">View</a></div>
                                        )}
                                        <div><strong>User Agent:</strong> <span style={{ fontSize: 11 }}>{fb.user_agent}</span></div>
                                        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                                          <label className={styles.label} style={{ flex: '0 0 auto' }}>
                                            Status
                                            <select value={feedbackEditStatus} onChange={e => setFeedbackEditStatus(e.target.value)} className={styles.planSelect}>
                                              <option value="new">New</option>
                                              <option value="reviewed">Reviewed</option>
                                              <option value="in_progress">In Progress</option>
                                              <option value="resolved">Resolved</option>
                                              <option value="wontfix">Won't Fix</option>
                                            </select>
                                          </label>
                                          <label className={styles.label} style={{ flex: 1 }}>
                                            Admin Notes
                                            <input className={styles.formInput} value={feedbackEditNotes} onChange={e => setFeedbackEditNotes(e.target.value)} placeholder="Internal notes…" />
                                          </label>
                                          <button className={styles.submitBtn} onClick={() => handleUpdateFeedback(fb.id)} style={{ marginBottom: 2 }}>Save</button>
                                        </div>
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
                </>
              )}
            </>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 5 — System Errors (D3 — super admin only)
        ══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              System Errors
              {clientErrors.length > 0 && <span className={styles.pill}>{clientErrors.length}</span>}
            </h2>
            <button className={styles.addBtn} onClick={handleToggleErrors}>
              {errorsOpen ? 'Close' : 'View Errors'}
            </button>
          </div>

          {errorsOpen && (
            <>
              {errorsLoading ? (
                <p className={styles.empty}>Loading errors…</p>
              ) : clientErrors.length === 0 ? (
                <p className={styles.empty}>No errors recorded.</p>
              ) : (
                <>
                  <div className={styles.testLogFilters}>
                    <select className={styles.testLogSelect}
                      value={errorsDateFilter} onChange={e => setErrorsDateFilter(e.target.value)}>
                      <option value="24h">Last 24 hours</option>
                      <option value="7d">Last 7 days</option>
                      <option value="30d">Last 30 days</option>
                      <option value="all">All time</option>
                    </select>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>Created</th>
                          <th className={styles.th}>User</th>
                          <th className={styles.th}>Company</th>
                          <th className={styles.th}>Error Message</th>
                          <th className={styles.th}>Page URL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientErrors
                          .filter(ce => {
                            if (errorsDateFilter === 'all') return true
                            const ago = { '24h': 1, '7d': 7, '30d': 30 }[errorsDateFilter] ?? 7
                            return new Date(ce.created_at) > new Date(Date.now() - ago * 86400000)
                          })
                          .map(ce => {
                            const ceUser = users.find(u => u.id === ce.user_id)?.email ?? '—'
                            const ceCompany = ce.tenant_id ? companies.find(c => c.id === ce.tenant_id)?.name ?? '—' : '—'
                            const isExpErr = expandedErrorId === ce.id
                            return (
                              <Fragment key={ce.id}>
                                <tr className={styles.tr} onClick={() => setExpandedErrorId(isExpErr ? null : ce.id)} style={{ cursor: 'pointer' }}>
                                  <td className={styles.td}>{new Date(ce.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className={styles.td}>{ceUser}</td>
                                  <td className={styles.td}>{ceCompany}</td>
                                  <td className={styles.td} title={ce.error_message}>{ce.error_message?.length > 60 ? ce.error_message.slice(0, 60) + '…' : ce.error_message}</td>
                                  <td className={styles.td} style={{ fontSize: 11 }}>{ce.page_url}</td>
                                </tr>
                                {isExpErr && (
                                  <tr className={styles.expandedRow}>
                                    <td colSpan={5} className={styles.expandedCell}>
                                      <div className={styles.expandedPanel}>
                                        <div><strong>Error:</strong> {ce.error_message}</div>
                                        {ce.stack_trace && (
                                          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 6, maxHeight: 300, overflow: 'auto' }}>
                                            {ce.stack_trace}
                                          </pre>
                                        )}
                                        {ce.component_stack && (
                                          <div>
                                            <strong>Component stack:</strong>
                                            <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{ce.component_stack}</pre>
                                          </div>
                                        )}
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
                </>
              )}
            </>
          )}
        </section>

      </main>
    </div>
  )
}
