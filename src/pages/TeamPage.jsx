import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import UserMenu from '../components/UserMenu'
import Modal from '../components/ui/Modal'
import styles from './TeamPage.module.css'

export default function TeamPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [teamMembers, setTeamMembers] = useState([])
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)
  const [search, setSearch] = useState('')

  // Invite state
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMethod, setInviteMethod] = useState('invite')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  useEffect(() => {
    async function load() {
      // Get current user's company
      const { data: myProfile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!myProfile?.company_id) {
        setLoading(false)
        return
      }

      // Get company name
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', myProfile.company_id)
        .maybeSingle()
      setCompanyName(company?.name || '')

      // RLS will scope this to same-tenant members
      const { data: members } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', myProfile.company_id)
        .order('created_at', { ascending: true })

      setTeamMembers(members ?? [])
      setLoading(false)
    }
    load()
  }, [user])

  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError('')

    try {
      // Get current user's company_id to pre-fill
      const { data: myProfile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const body = inviteMethod === 'invite'
        ? { action: 'invite', email: inviteEmail.trim(), company_id: myProfile?.company_id || null }
        : { action: 'create', email: inviteEmail.trim(), password: invitePassword, company_id: myProfile?.company_id || null }

      const { data, error } = await supabase.functions.invoke('admin-users', { body })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)

      // Refresh team list
      const { data: members } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', myProfile?.company_id)
        .order('created_at', { ascending: true })
      setTeamMembers(members ?? [])

      setInviteEmail('')
      setInvitePassword('')
      setShowInvite(false)
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviting(false)
    }
  }

  const displayed = teamMembers.filter(m => {
    if (!showDeleted && m.deleted_at) return false
    if (search) {
      const q = search.toLowerCase()
      if (!m.email?.toLowerCase().includes(q) && !(m.full_name || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>&larr; Dashboard</button>
          <h1 className={styles.title}>Team {companyName && `- ${companyName}`}</h1>
        </div>
        <UserMenu />
      </header>

      <main className={styles.main}>
        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            placeholder="Search team members..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className={styles.addBtn} onClick={() => { setShowInvite(v => !v); setInviteError('') }}>
            {showInvite ? 'Cancel' : '+ Invite User'}
          </button>
        </div>

        {showInvite && (
          <form className={styles.inviteForm} onSubmit={handleInvite}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button type="button" className={inviteMethod === 'invite' ? styles.addBtn : styles.secondaryBtn} onClick={() => setInviteMethod('invite')}>Send invitation</button>
              <button type="button" className={inviteMethod === 'create' ? styles.addBtn : styles.secondaryBtn} onClick={() => setInviteMethod('create')}>Set password</button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input type="email" className={styles.searchInput} placeholder="Email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required style={{ flex: 1, minWidth: 200 }} />
              {inviteMethod === 'create' && (
                <input type="password" className={styles.searchInput} placeholder="Password" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} required style={{ flex: 1, minWidth: 150 }} />
              )}
              <button type="submit" className={styles.addBtn} disabled={inviting}>
                {inviting ? 'Sending...' : inviteMethod === 'invite' ? 'Send Invitation' : 'Create User'}
              </button>
            </div>
            {inviteError && <p style={{ color: '#fca5a5', fontSize: 12, marginTop: 6 }}>{inviteError}</p>}
          </form>
        )}

        {loading ? (
          <p className={styles.empty}>Loading...</p>
        ) : displayed.length === 0 ? (
          <p className={styles.empty}>No team members found.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Name</th>
                  <th className={styles.th}>Email</th>
                  <th className={styles.th}>Role</th>
                  <th className={styles.th}>Setup</th>
                  <th className={styles.th}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(m => (
                  <tr
                    key={m.id}
                    className={styles.tr}
                    onClick={() => navigate(`/dashboard/team/${m.user_id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className={styles.td}>
                      {m.full_name || '-'}
                      {m.deleted_at && <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 6 }}>Deleted</span>}
                    </td>
                    <td className={styles.td}>{m.email}</td>
                    <td className={styles.td}>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                        {(m.role || 'contractor_user').replace('contractor_', '')}
                      </span>
                    </td>
                    <td className={styles.td}>
                      {m.setup_completed_at ? (
                        <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>Complete</span>
                      ) : (
                        <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>Pending</span>
                      )}
                    </td>
                    <td className={styles.td}>{new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, color: 'var(--color-text-muted)' }}>
          <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
          Show deleted users
        </label>
      </main>
    </div>
  )
}
