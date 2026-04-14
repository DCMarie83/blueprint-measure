import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { adminSupabase } from '../lib/supabaseAdmin'
import styles from './AdminPage.module.css'

// The three feature flags tracked per company.
const FEATURES = [
  { key: 'multi_page_pdf', label: 'Multi-page PDF' },
  { key: 'csv_export',     label: 'CSV Export'     },
  { key: 'redraw_zones',   label: 'Redraw Zones'   },
]

export default function AdminPage() {
  // ── Data ──────────────────────────────────────────────────────────────────────
  const [companies,    setCompanies]    = useState([])
  const [users,        setUsers]        = useState([])
  const [userProfiles, setUserProfiles] = useState([])
  const [sessions,     setSessions]     = useState([]) // [{user_id}] for counting
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState('')

  // ── Add company form ──────────────────────────────────────────────────────────
  const [showAddCompany,  setShowAddCompany]  = useState(false)
  const [newCompanyName,  setNewCompanyName]  = useState('')
  const [newCompanyPlan,  setNewCompanyPlan]  = useState('free')
  const [savingCompany,   setSavingCompany]   = useState(false)
  const [companyError,    setCompanyError]    = useState('')

  // ── Add user form ─────────────────────────────────────────────────────────────
  const [showAddUser,      setShowAddUser]      = useState(false)
  const [newUserEmail,     setNewUserEmail]     = useState('')
  const [newUserPassword,  setNewUserPassword]  = useState('')
  const [newUserCompanyId, setNewUserCompanyId] = useState('')
  const [savingUser,       setSavingUser]       = useState(false)
  const [userError,        setUserError]        = useState('')

  // ── Feature flag saving ───────────────────────────────────────────────────────
  // Tracks which company rows are currently saving so we can disable their toggles.
  const [savingFlags, setSavingFlags] = useState({}) // { [companyId]: boolean }

  // ── Load all data ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [
        { data: companiesData, error: companiesErr },
        { data: authData,      error: usersErr      },
        { data: profilesData,  error: profilesErr   },
        { data: sessionsData,  error: sessionsErr   },
      ] = await Promise.all([
        adminSupabase.from('companies').select('*').order('created_at', { ascending: true }),
        adminSupabase.auth.admin.listUsers({ perPage: 1000 }),
        adminSupabase.from('user_profiles').select('*'),
        adminSupabase.from('sessions').select('user_id'),
      ])

      if (companiesErr) throw new Error('companies: ' + companiesErr.message)
      if (usersErr)     throw new Error('auth users: ' + usersErr.message)
      if (profilesErr)  throw new Error('user_profiles: ' + profilesErr.message)
      if (sessionsErr)  throw new Error('sessions: ' + sessionsErr.message)

      setCompanies(companiesData ?? [])
      setUsers(authData?.users ?? [])
      setUserProfiles(profilesData ?? [])
      setSessions(sessionsData ?? [])
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!adminSupabase) {
      setLoadError('VITE_SUPABASE_SERVICE_ROLE_KEY is not set — see setup instructions below.')
      setLoading(false)
      return
    }
    loadAll()
  }, [loadAll])

  // ── Derived helpers ───────────────────────────────────────────────────────────

  // Count sessions that belong to any user in this company.
  function sessionCountFor(companyId) {
    const companyUserIds = userProfiles
      .filter(p => p.company_id === companyId)
      .map(p => p.user_id)
    return sessions.filter(s => companyUserIds.includes(s.user_id)).length
  }

  // Find the company name for a given auth user id.
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
      const { data, error } = await adminSupabase
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

  async function handleAddUser(e) {
    e.preventDefault()
    if (!newUserEmail.trim() || !newUserPassword.trim()) return
    setSavingUser(true)
    setUserError('')
    try {
      // Step 1 — create the Supabase auth account
      const { data: authData, error: authErr } = await adminSupabase.auth.admin.createUser({
        email: newUserEmail.trim(),
        password: newUserPassword,
        email_confirm: true, // skip the confirmation email, they can log in immediately
      })
      if (authErr) throw new Error(authErr.message)

      // Step 2 — link the new user to their company in user_profiles
      const { error: profileErr } = await adminSupabase
        .from('user_profiles')
        .insert({
          user_id:    authData.user.id,
          company_id: newUserCompanyId || null,
          email:      authData.user.email,
        })
      if (profileErr) throw new Error(profileErr.message)

      // Refresh everything so the table shows the new user
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

  async function handleToggleFlag(company, flagKey) {
    // Disable all toggles for this row while saving
    setSavingFlags(prev => ({ ...prev, [company.id]: true }))

    const current  = company.features ?? {}
    const updated  = { ...current, [flagKey]: !current[flagKey] }

    // Optimistic update — flip the toggle immediately so it feels instant
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, features: updated } : c))

    try {
      const { error } = await adminSupabase
        .from('companies')
        .update({ features: updated })
        .eq('id', company.id)
      if (error) throw new Error(error.message)
    } catch (err) {
      // Revert the optimistic update on failure
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, features: current } : c))
      alert('Failed to save: ' + err.message)
    } finally {
      setSavingFlags(prev => ({ ...prev, [company.id]: false }))
    }
  }

  // ── Missing env key screen ────────────────────────────────────────────────────
  if (!adminSupabase) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <div className={styles.errorBox}>
            <strong>Service role key not configured.</strong>
            <p>
              Add <code>VITE_SUPABASE_SERVICE_ROLE_KEY</code> to your <code>.env.local</code> file,
              then restart the dev server. You can find this key in your Supabase dashboard
              under Project Settings → API → service_role (secret).
            </p>
          </div>
        </div>
      </div>
    )
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

      {/* ── Header ── */}
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

          {/* Add company form */}
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

          {/* Companies table */}
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
                  {companies.map(company => (
                    <tr key={company.id} className={styles.tr}>
                      <td className={styles.td}>{company.name}</td>
                      <td className={styles.td}>
                        <span className={company.plan === 'paid' ? styles.badgePaid : styles.badgeFree}>
                          {company.plan}
                        </span>
                      </td>
                      <td className={styles.td}>{sessionCountFor(company.id)}</td>
                      <td className={styles.td}>
                        <div className={styles.flagGroup}>
                          {FEATURES.map(({ key, label }) => (
                            <label key={key} className={styles.flagRow}>
                              <input
                                type="checkbox"
                                className={styles.flagCheck}
                                checked={!!( (company.features ?? {})[key] )}
                                onChange={() => handleToggleFlag(company, key)}
                                disabled={!!savingFlags[company.id]}
                              />
                              <span className={styles.flagLabel}>{label}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
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
              {showAddUser ? 'Cancel' : '+ Add User'}
            </button>
          </div>

          {/* Add user form */}
          {showAddUser && (
            <form className={styles.form} onSubmit={handleAddUser}>
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
                  <label className={styles.formLabel}>Temporary Password</label>
                  <input
                    type="password"
                    className={styles.formInput}
                    value={newUserPassword}
                    onChange={e => setNewUserPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    minLength={6}
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
                  {savingUser ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          )}

          {/* Users table */}
          {users.length === 0 ? (
            <p className={styles.empty}>No users found.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Email</th>
                    <th className={styles.th}>Company</th>
                    <th className={styles.th}>Created</th>
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
