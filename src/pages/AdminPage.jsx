import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './AdminPage.module.css'

const FEATURES = [
  { key: 'multi_page_pdf', label: 'Multi-page PDF' },
  { key: 'csv_export',     label: 'CSV Export'     },
  { key: 'redraw_zones',   label: 'Redraw Zones'   },
]

const PLAN_DESC = {
  free: 'Basic measurement only',
  paid: 'All features unlocked',
}

export default function AdminPage() {
  // ── Data ──────────────────────────────────────────────────────────────────────
  const [companies,    setCompanies]    = useState([])
  const [users,        setUsers]        = useState([])
  const [userProfiles, setUserProfiles] = useState([])
  const [sessions,     setSessions]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState('')

  // ── Add company form ──────────────────────────────────────────────────────────
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyPlan, setNewCompanyPlan] = useState('free')
  const [savingCompany,  setSavingCompany]  = useState(false)
  const [companyError,   setCompanyError]   = useState('')

  // ── Invite user form ──────────────────────────────────────────────────────────
  const [showAddUser,      setShowAddUser]      = useState(false)
  const [newUserEmail,     setNewUserEmail]     = useState('')
  const [newUserCompanyId, setNewUserCompanyId] = useState('')
  const [savingUser,       setSavingUser]       = useState(false)
  const [userError,        setUserError]        = useState('')

  // ── Delete user ───────────────────────────────────────────────────────────────
  const [deletingUserId, setDeletingUserId] = useState(null)

  // ── Feature flag saving ───────────────────────────────────────────────────────
  const [savingFlags, setSavingFlags] = useState({})

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
        supabase.from('sessions').select('user_id'),
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

  // ── Derived helpers ───────────────────────────────────────────────────────────

  function sessionCountFor(companyId) {
    const ids = userProfiles.filter(p => p.company_id === companyId).map(p => p.user_id)
    return sessions.filter(s => ids.includes(s.user_id)).length
  }

  function companyNameFor(userId) {
    const profile = userProfiles.find(p => p.user_id === userId)
    if (!profile?.company_id) return '—'
    return companies.find(c => c.id === profile.company_id)?.name ?? '—'
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

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

  async function handleInviteUser(e) {
    e.preventDefault()
    if (!newUserEmail.trim()) return
    setSavingUser(true)
    setUserError('')
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action:     'invite',
          email:      newUserEmail.trim(),
          company_id: newUserCompanyId || null,
        },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)

      await loadAll()
      setNewUserEmail('')
      setNewUserCompanyId('')
      setShowAddUser(false)
    } catch (err) {
      setUserError(err.message)
    } finally {
      setSavingUser(false)
    }
  }

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

      // Remove from local state immediately — no need to reload everything
      setUsers(prev => prev.filter(u => u.id !== user.id))
      setUserProfiles(prev => prev.filter(p => p.user_id !== user.id))
    } catch (err) {
      alert('Failed to delete user: ' + err.message)
    } finally {
      setDeletingUserId(null)
    }
  }

  async function handleToggleFlag(company, flagKey) {
    setSavingFlags(prev => ({ ...prev, [company.id]: true }))
    const current = company.features ?? {}
    const updated = { ...current, [flagKey]: !current[flagKey] }

    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, features: updated } : c))

    try {
      const { error } = await supabase
        .from('companies')
        .update({ features: updated })
        .eq('id', company.id)
      if (error) throw new Error(error.message)
    } catch (err) {
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, features: current } : c))
      alert('Failed to save: ' + err.message)
    } finally {
      setSavingFlags(prev => ({ ...prev, [company.id]: false }))
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
                  </tr>
                </thead>
                <tbody>
                  {companies.map(company => {
                    const flags = company.features ?? {}
                    const isSaving = !!savingFlags[company.id]
                    return (
                      <tr key={company.id} className={styles.tr}>
                        <td className={styles.td}>{company.name}</td>

                        {/* Plan badge + description */}
                        <td className={styles.td}>
                          <div className={styles.planCell}>
                            <span className={company.plan === 'paid' ? styles.badgePaid : styles.badgeFree}>
                              {company.plan}
                            </span>
                            <span className={styles.planDesc}>
                              {PLAN_DESC[company.plan]}
                            </span>
                          </div>
                        </td>

                        <td className={styles.td}>{sessionCountFor(company.id)}</td>

                        {/* Feature flag toggles */}
                        <td className={styles.td}>
                          <div className={styles.flagGroup}>
                            {FEATURES.map(({ key, label }) => {
                              const on = !!flags[key]
                              return (
                                <label
                                  key={key}
                                  className={`${styles.flagRow} ${on ? styles.flagRowOn : ''}`}
                                >
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
            <form className={styles.form} onSubmit={handleInviteUser}>
              <p className={styles.formHint}>
                An invitation email will be sent. The user sets their own password when they accept.
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
                  {savingUser ? 'Sending invite…' : 'Send Invitation'}
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
                  {users.map(u => (
                    <tr key={u.id} className={styles.tr}>
                      <td className={styles.td}>{u.email}</td>
                      <td className={styles.td}>{companyNameFor(u.id)}</td>
                      <td className={styles.td}>
                        {new Date(u.created_at).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </td>
                      <td className={styles.tdAction}>
                        <button
                          className={styles.deleteUserBtn}
                          onClick={() => handleDeleteUser(u)}
                          disabled={deletingUserId === u.id}
                        >
                          {deletingUserId === u.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
