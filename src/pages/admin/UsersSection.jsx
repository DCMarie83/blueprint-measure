import { useState, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useAdminData } from '../../context/AdminDataContext'
import styles from './sections.module.css'

const PAGE_SIZE = 50

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

export default function UsersSection() {
  const navigate = useNavigate()
  const { isSuperAdmin } = useAuth()
  const { companies, users, setUsers, userProfiles, setUserProfiles, companyNameFor, profileCompanyIdFor, roleFor, loadAll } = useAdminData()

  // Orphan detection
  const [orphans, setOrphans] = useState(null)
  const [orphanLoading, setOrphanLoading] = useState(false)
  const [orphanError, setOrphanError] = useState('')

  async function handleDetectOrphans() {
    setOrphanLoading(true)
    setOrphanError('')
    try {
      const { data, error } = await supabase.rpc('detect_user_orphans')
      if (error) throw new Error(error.message)
      setOrphans(data ?? [])
    } catch (err) {
      setOrphanError(err.message)
    } finally {
      setOrphanLoading(false)
    }
  }

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created')
  const [page, setPage] = useState(0)

  // Add user
  const [showAdd, setShowAdd] = useState(false)
  const [addMethod, setAddMethod] = useState('invite')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newCompanyId, setNewCompanyId] = useState('')
  const [savingUser, setSavingUser] = useState(false)
  const [userError, setUserError] = useState('')

  // Inline editing
  const [editingCoUserId, setEditingCoUserId] = useState(null)
  const [editCoValue, setEditCoValue] = useState('')
  const [savingCoUserId, setSavingCoUserId] = useState(null)
  const [resetSentId, flashResetSent] = useTempId()
  const [resendSentId, flashResendSent] = useTempId()
  const [setPasswordUserId, setSetPasswordUserId] = useState(null)
  const [setPasswordValue, setSetPasswordValue] = useState('')
  const [setPasswordSaving, setSetPasswordSaving] = useState(false)
  const [setPasswordDoneId, flashSetPasswordDone] = useTempId()
  const [showDeleted, setShowDeleted] = useState(false)

  // Filter, sort, paginate
  let filtered = users
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(u => {
      const profile = userProfiles.find(p => p.user_id === u.id)
      return u.email?.toLowerCase().includes(q) || (profile?.full_name ?? '').toLowerCase().includes(q)
    })
  }
  if (roleFilter !== 'all') filtered = filtered.filter(u => roleFor(u.id) === roleFilter)
  if (statusFilter === 'active') filtered = filtered.filter(u => !!u.last_sign_in_at)
  else if (statusFilter === 'pending') filtered = filtered.filter(u => !u.last_sign_in_at)
  if (companyFilter !== 'all') filtered = filtered.filter(u => profileCompanyIdFor(u.id) === companyFilter)
  if (!showDeleted) filtered = filtered.filter(u => {
    const profile = userProfiles.find(p => p.user_id === u.id)
    return !profile?.deleted_at
  })

  if (sortBy === 'email') filtered = [...filtered].sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))
  else if (sortBy === 'last_sign_in') filtered = [...filtered].sort((a, b) => new Date(b.last_sign_in_at ?? 0) - new Date(a.last_sign_in_at ?? 0))

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Handlers
  async function handleAdd(e) {
    e.preventDefault()
    if (!newEmail.trim()) return
    if (addMethod === 'create' && !newPassword.trim()) { setUserError('Password required.'); return }
    setSavingUser(true); setUserError('')
    try {
      const body = addMethod === 'invite'
        ? { action: 'invite', email: newEmail.trim(), company_id: newCompanyId || null }
        : { action: 'create', email: newEmail.trim(), password: newPassword, company_id: newCompanyId || null }
      const { data, error } = await supabase.functions.invoke('admin-users', { body })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      await loadAll()
      setNewEmail(''); setNewPassword(''); setNewCompanyId(''); setShowAdd(false)
    } catch (err) { setUserError(err.message) } finally { setSavingUser(false) }
  }

  async function handleResend(user) {
    const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'resend', email: user.email } })
    if (error || data?.error) { alert('Failed: ' + (data?.error ?? error?.message)); return }
    flashResendSent(user.id)
  }

  async function handleSaveUserCompany(user) {
    setSavingCoUserId(user.id)
    try {
      const { error } = await supabase.from('user_profiles').upsert({ user_id: user.id, company_id: editCoValue || null, email: user.email }, { onConflict: 'user_id' })
      if (error) throw new Error(error.message)
      setUserProfiles(prev => {
        const exists = prev.find(p => p.user_id === user.id)
        if (exists) return prev.map(p => p.user_id === user.id ? { ...p, company_id: editCoValue || null } : p)
        return [...prev, { user_id: user.id, company_id: editCoValue || null, email: user.email }]
      })
      setEditingCoUserId(null)
    } catch (err) { alert('Failed: ' + err.message) } finally { setSavingCoUserId(null) }
  }

  async function handleResetPassword(user) {
    if (!window.confirm(`Send reset email to ${user.email}?`)) return
    const { error } = await supabase.auth.resetPasswordForEmail(user.email)
    if (error) { alert('Failed: ' + error.message); return }
    flashResetSent(user.id)
  }

  async function handleChangeRole(userId, newRole) {
    try {
      const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('user_id', userId)
      if (error) throw new Error(error.message)
      setUserProfiles(prev => prev.map(p => p.user_id === userId ? { ...p, role: newRole } : p))
    } catch (err) { alert('Failed: ' + err.message) }
  }

  async function handleSetPassword(userId) {
    if (!setPasswordValue.trim()) return
    setSetPasswordSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', { body: { action: 'set_password', user_id: userId, new_password: setPasswordValue } })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      flashSetPasswordDone(userId)
      setSetPasswordUserId(null); setSetPasswordValue('')
    } catch (err) { alert('Failed: ' + err.message) } finally { setSetPasswordSaving(false) }
  }

  function handleExportCSV() {
    const rows = [['ID', 'Email', 'Full Name', 'Phone', 'Company Name', 'Plan', 'Role', 'Status', 'Created At', 'Last Sign In At']]
    filtered.forEach(u => {
      const profile = userProfiles.find(p => p.user_id === u.id)
      const company = profile?.company_id ? companies.find(c => c.id === profile.company_id) : null
      rows.push([u.id, u.email ?? '', profile?.full_name ?? '', profile?.phone ?? '', company?.name ?? '', company?.plan ?? '', profile?.role ?? 'contractor_user', u.last_sign_in_at ? 'active' : 'pending', u.created_at ?? '', u.last_sign_in_at ?? ''])
    })
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rivetdog_users_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Users <span className={styles.pill}>{users.length}</span></h1>

      <div className={styles.toolbar}>
        <input className={styles.searchInput} placeholder="Search by email or name…" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        <select className={styles.filterSelect} value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0) }}>
          <option value="all">All Roles</option>
          <option value="contractor_user">User</option>
          <option value="contractor_admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <select className={styles.filterSelect} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
        </select>
        <select className={styles.filterSelect} value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setPage(0) }}>
          <option value="all">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={styles.filterSelect} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="created">Created</option>
          <option value="last_sign_in">Last Sign-In</option>
          <option value="email">Email A-Z</option>
        </select>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>
          <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
          Show deleted
        </label>
        <button className={styles.secondaryBtn} onClick={handleExportCSV}>Export CSV</button>
        <button className={styles.addBtn} onClick={() => { setShowAdd(v => !v); setUserError('') }}>
          {showAdd ? 'Cancel' : '+ Invite User'}
        </button>
      </div>

      {showAdd && (
        <form className={styles.form} onSubmit={handleAdd}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" className={addMethod === 'invite' ? styles.addBtn : styles.secondaryBtn} onClick={() => setAddMethod('invite')}>Send invitation</button>
            <button type="button" className={addMethod === 'create' ? styles.addBtn : styles.secondaryBtn} onClick={() => setAddMethod('create')}>Set password</button>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Email</label>
              <input type="email" className={styles.formInput} value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
            </div>
            {addMethod === 'create' && (
              <div className={styles.formField}>
                <label className={styles.formLabel}>Password</label>
                <input type="password" className={styles.formInput} value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              </div>
            )}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Company</label>
              <select className={styles.formSelect} value={newCompanyId} onChange={e => setNewCompanyId(e.target.value)}>
                <option value="">— No company —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {userError && <p className={styles.fieldError}>{userError}</p>}
          <div className={styles.formActions}>
            <button type="submit" className={styles.submitBtn} disabled={savingUser}>{savingUser ? 'Saving…' : (addMethod === 'invite' ? 'Send Invitation' : 'Create User')}</button>
          </div>
        </form>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Email</th>
              <th className={styles.th}>Company</th>
              <th className={styles.th}>Role</th>
              <th className={styles.th}>Last Login</th>
              <th className={styles.th}>Created</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(u => {
              const profile = userProfiles.find(p => p.user_id === u.id)
              return (
              <Fragment key={u.id}>
                <tr className={styles.tr} onClick={() => navigate(`/admin/users/${u.id}`)} style={{ cursor: 'pointer' }}>
                  <td className={styles.td}>
                    {u.email}
                    {!u.last_sign_in_at && <span className={styles.pendingBadge}>Pending</span>}
                    {profile?.deleted_at && <span style={{ fontSize: 10, fontWeight: 600, color: '#ef4444', marginLeft: 6, padding: '2px 6px', background: 'rgba(239,68,68,0.1)', borderRadius: 4 }}>DELETED</span>}
                  </td>
                  <td className={styles.td} onClick={e => e.stopPropagation()}>
                    {editingCoUserId === u.id ? (
                      <div className={styles.inlineEdit}>
                        <select className={styles.formSelect} value={editCoValue} onChange={e => setEditCoValue(e.target.value)} autoFocus>
                          <option value="">— None —</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button className={styles.inlineSaveBtn} onClick={() => handleSaveUserCompany(u)} disabled={savingCoUserId === u.id}>Save</button>
                        <button className={styles.inlineCancelBtn} onClick={() => setEditingCoUserId(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{companyNameFor(u.id)}</span>
                        <button className={styles.iconBtn} onClick={() => { setEditingCoUserId(u.id); setEditCoValue(profileCompanyIdFor(u.id)) }}>✎</button>
                      </div>
                    )}
                  </td>
                  <td className={styles.td} onClick={e => e.stopPropagation()}>
                    <select className={styles.roleSelect} value={roleFor(u.id)} onChange={e => handleChangeRole(u.id, e.target.value)}>
                      <option value="contractor_user">User</option>
                      <option value="contractor_admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </td>
                  <td className={styles.td} style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td className={styles.td}>{new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  <td className={styles.td} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!u.last_sign_in_at && <button className={styles.secondaryBtn} onClick={() => handleResend(u)} disabled={resendSentId === u.id}>{resendSentId === u.id ? 'Sent!' : 'Resend'}</button>}
                      <button className={styles.secondaryBtn} onClick={() => { setSetPasswordUserId(setPasswordUserId === u.id ? null : u.id); setSetPasswordValue('') }}>{setPasswordUserId === u.id ? 'Cancel' : 'Set Pwd'}</button>
                      {setPasswordDoneId === u.id && <span style={{ fontSize: 11, color: '#22c55e' }}>Updated!</span>}
                      <button className={styles.secondaryBtn} onClick={() => handleResetPassword(u)} disabled={resetSentId === u.id}>{resetSentId === u.id ? 'Sent!' : 'Reset'}</button>
                    </div>
                  </td>
                </tr>
                {setPasswordUserId === u.id && (
                  <tr><td colSpan={6} className={styles.td}>
                    <div className={styles.inlineEdit}>
                      <input type="password" className={styles.inlineInput} value={setPasswordValue} onChange={e => setSetPasswordValue(e.target.value)} placeholder="New password" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSetPassword(u.id); if (e.key === 'Escape') setSetPasswordUserId(null) }} />
                      <button className={styles.inlineSaveBtn} onClick={() => handleSetPassword(u.id)} disabled={setPasswordSaving || !setPasswordValue.trim()}>Save</button>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            )})}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} className={`${styles.pageBtn} ${page === i ? styles.pageBtnActive : ''}`} onClick={() => setPage(i)}>{i + 1}</button>
          ))}
        </div>
      )}

      {isSuperAdmin && (
        <div style={{ marginTop: 32, borderTop: '1px solid var(--color-border)', paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 className={styles.pageTitle} style={{ margin: 0, fontSize: 16 }}>Orphan Detection</h2>
            <button className={styles.secondaryBtn} onClick={handleDetectOrphans} disabled={orphanLoading}>
              {orphanLoading ? 'Scanning…' : 'Detect Orphans'}
            </button>
          </div>
          {orphanError && <p className={styles.fieldError}>{orphanError}</p>}
          {orphans !== null && (
            orphans.length === 0 ? (
              <p style={{ color: 'var(--color-success)', fontSize: 13 }}>No orphans detected</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Email</th>
                      <th className={styles.th}>Issue</th>
                      <th className={styles.th}>Auth</th>
                      <th className={styles.th}>Public</th>
                      <th className={styles.th}>Profile</th>
                      <th className={styles.th}>Profile Co.</th>
                      <th className={styles.th}>Public Co.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphans.map((o, i) => (
                      <tr key={i} className={styles.tr}>
                        <td className={styles.td}>{o.email}</td>
                        <td className={styles.td}><span className={styles.badge} style={{ fontSize: 11 }}>{o.issue}</span></td>
                        <td className={styles.td}>{o.has_auth_user ? 'Y' : 'N'}</td>
                        <td className={styles.td}>{o.has_public_user ? 'Y' : 'N'}</td>
                        <td className={styles.td}>{o.has_profile ? 'Y' : 'N'}</td>
                        <td className={styles.td} style={{ fontSize: 11 }}>{o.profile_company_id?.slice(0, 8) ?? '—'}</td>
                        <td className={styles.td} style={{ fontSize: 11 }}>{o.public_user_company_id?.slice(0, 8) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
