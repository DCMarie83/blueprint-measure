import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './AdminPage.module.css'

const FEATURES = [
  { key: 'multi_page_pdf',   label: 'Multi-page PDF'   },
  { key: 'csv_export',       label: 'CSV Export'       },
  { key: 'redraw_zones',     label: 'Redraw Zones'     },
  { key: 'paint_calculator', label: 'Paint Calculator' },
]

const PLAN_DESC = {
  free: 'Basic measurement only',
  paid: 'All features unlocked',
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
  const [newCompanyPlan, setNewCompanyPlan] = useState('free')
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
  const [setPasswordUserId, setSetPasswordUserId] = useState(null) // which row is open
  const [setPasswordValue,  setSetPasswordValue]  = useState('')
  const [setPasswordSaving, setSetPasswordSaving] = useState(false)
  const [setPasswordDoneId, flashSetPasswordDone] = useTempId()

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
        supabase.from('sessions').select('user_id, created_at, blueprint_url'),
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

  function companyNameFor(userId) {
    const profile = userProfiles.find(p => p.user_id === userId)
    if (!profile?.company_id) return '—'
    return companies.find(c => c.id === profile.company_id)?.name ?? '—'
  }

  function profileCompanyIdFor(userId) {
    return userProfiles.find(p => p.user_id === userId)?.company_id ?? ''
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
      const { data, error } = await supabase
        .from('companies')
        .insert({ name: newCompanyName.trim(), plan: newCompanyPlan, features: {} })
        .select()
        .single()
      if (error) throw new Error(error.message)
      setCompanies(prev => [...prev, data])
      setNewCompanyName('')
      setNewCompanyPlan('free')
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
        <Link to="/dashboard" className={styles.backLink}>← Back to Dashboard</Link>
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
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
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
                    <th className={styles.th}>Sessions</th>
                    <th className={styles.th}>Feature Flags</th>
                    <th className={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(company => {
                    const flags = company.features ?? {}
                    const isSaving = !!savingFlags[company.id]
                    const isEditingName = editingNameId === company.id
                    const isEditingNotes = editingNotesId === company.id
                    return (
                      <tr key={company.id} className={styles.tr}>

                        {/* ── Company name + notes ── */}
                        <td className={styles.td}>
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
                        </td>

                        {/* ── Plan ── */}
                        <td className={styles.td}>
                          <div className={styles.planCell}>
                            <span className={company.plan === 'paid' ? styles.badgePaid : styles.badgeFree}>
                              {company.plan}
                            </span>
                            <span className={styles.planDesc}>{PLAN_DESC[company.plan]}</span>
                          </div>
                        </td>

                        {/* ── Sessions ── */}
                        <td className={styles.td}>{sessionCountFor(company.id)}</td>

                        {/* ── Feature flags ── */}
                        <td className={styles.td}>
                          <div className={styles.flagGroup}>
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
                        <td className={styles.tdAction}>
                          <button
                            className={styles.deleteUserBtn}
                            onClick={() => handleDeleteCompany(company)}
                            disabled={deletingCompanyId === company.id}
                          >
                            {deletingCompanyId === company.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
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
            <button
              className={styles.addBtn}
              onClick={() => { setShowAddUser(v => !v); setUserError('') }}
            >
              {showAddUser ? 'Cancel' : '+ Invite User'}
            </button>
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

                        {/* ── Created ── */}
                        <td className={styles.td}>
                          {new Date(u.created_at).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </td>

                        {/* ── Actions ── */}
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
                          <td colSpan={4} className={styles.setPasswordCell}>
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

      </main>
    </div>
  )
}
