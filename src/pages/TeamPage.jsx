import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useImpersonation } from '../context/ImpersonationContext'
import { usePlan } from '../lib/plans'
import { resolveEntitlements } from '../lib/entitlements'
import Modal from '../components/ui/Modal'
import { useDateFormat } from '../hooks/useDateFormat'
import styles from './TeamPage.module.css'

export default function TeamPage() {
  const { t } = useTranslation()
  const { user, company } = useAuth()
  const { isImpersonating } = useImpersonation()
  const navigate = useNavigate()
  const [teamMembers, setTeamMembers] = useState([])
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  // Invite state
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteMethod, setInviteMethod] = useState('invite')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const { formatDate } = useDateFormat()

  // Seat request state
  const [showSeatRequest, setShowSeatRequest] = useState(false)
  const [requestingSeats, setRequestingSeats] = useState(false)
  const [seatRequestSent, setSeatRequestSent] = useState(false)

  // Resolve entitlements for seat display
  const rawPlan = usePlan(company?.plan_key)
  const entitlements = company ? resolveEntitlements(company, rawPlan) : null
  const seatLimit = entitlements?.seats // null = unlimited
  const activeMembers = teamMembers.filter(m => !m.deleted_at)
  const activeCount = activeMembers.length
  const atLimit = seatLimit != null && activeCount >= seatLimit

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
      const { data: companyData } = await supabase
        .from('companies')
        .select('name')
        .eq('id', myProfile.company_id)
        .maybeSingle()
      setCompanyName(companyData?.name || '')

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

      // Handle seat limit error from edge fn
      if (data?.error === 'seat_limit_reached') {
        setInviteError(t('team:seats.atLimit', { limit: data.limit }))
        return
      }
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

  async function handleSeatRequest() {
    if (isImpersonating) {
      alert(t('common:guard.impersonationBilling'))
      return
    }
    setRequestingSeats(true)
    try {
      const { data, error } = await supabase.functions.invoke('request-seats')
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      setSeatRequestSent(true)
      setShowSeatRequest(false)
    } catch (err) {
      alert(t('team:seats.requestFailed', { error: err.message }))
    } finally {
      setRequestingSeats(false)
    }
  }

  const displayed = teamMembers.filter(m => {
    if (!showDeleted && m.deleted_at) return false
    if (search) {
      const q = search.toLowerCase()
      if (!m.email?.toLowerCase().includes(q) && !(m.full_name || '').toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    const av = a[sortBy], bv = b[sortBy]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'string') return dir * av.localeCompare(bv)
    return dir * (new Date(av) - new Date(bv))
  })

  function handleSort(col) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>{t('team:title')} {companyName && `- ${companyName}`}</h1>
        {/* Seat usage line */}
        {entitlements && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, fontSize: 13, color: 'var(--color-text-muted)' }}>
            {entitlements.isExempt ? (
              <span>{t('team:seats.unlimited')}</span>
            ) : (
              <span>{t('team:seats.used', { used: activeCount, limit: seatLimit })}</span>
            )}
            {!entitlements.isExempt && (
              <button
                className={styles.secondaryBtn ?? styles.addBtn}
                style={{ fontSize: 12, padding: '4px 10px', opacity: seatRequestSent ? 0.6 : 1 }}
                onClick={() => seatRequestSent ? null : setShowSeatRequest(true)}
                disabled={seatRequestSent}
              >
                {seatRequestSent ? t('team:seats.requestSent') : t('team:seats.requestMore')}
              </button>
            )}
          </div>
        )}

        {/* At-limit banner */}
        {atLimit && !entitlements?.isExempt && (
          <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#f59e0b' }}>
            {t('team:seats.atLimit', { limit: seatLimit })}
          </div>
        )}

        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            placeholder={t('team:searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className={styles.addBtn}
            onClick={() => { setShowInvite(v => !v); setInviteError('') }}
            disabled={atLimit && !entitlements?.isExempt}
            style={atLimit && !entitlements?.isExempt ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            {showInvite ? t('common:action.cancel') : t('team:inviteUser')}
          </button>
        </div>

        {showInvite && (
          <form className={styles.inviteForm} onSubmit={handleInvite}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button type="button" className={inviteMethod === 'invite' ? styles.addBtn : styles.secondaryBtn} onClick={() => setInviteMethod('invite')}>{t('team:invite.sendInvitation')}</button>
              <button type="button" className={inviteMethod === 'create' ? styles.addBtn : styles.secondaryBtn} onClick={() => setInviteMethod('create')}>{t('team:invite.setPassword')}</button>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input type="email" className={styles.searchInput} placeholder={t('team:invite.emailPlaceholder')} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required style={{ flex: 1, minWidth: 200 }} />
              {inviteMethod === 'create' && (
                <input type="password" className={styles.searchInput} placeholder={t('team:invite.passwordPlaceholder')} value={invitePassword} onChange={e => setInvitePassword(e.target.value)} required style={{ flex: 1, minWidth: 150 }} />
              )}
              <button type="submit" className={styles.addBtn} disabled={inviting}>
                {inviting ? t('team:sending') : inviteMethod === 'invite' ? t('team:invite.sendInvitationBtn') : t('team:invite.createUser')}
              </button>
            </div>
            {inviteError && <p style={{ color: '#fca5a5', fontSize: 12, marginTop: 6 }}>{inviteError}</p>}
          </form>
        )}

        {loading ? (
          <p className={styles.empty}>{t('team:loading')}</p>
        ) : displayed.length === 0 ? (
          <p className={styles.empty}>{t('team:empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {[
                    { key: 'full_name', label: t('team:columns.name') },
                    { key: 'email', label: t('team:columns.email') },
                    { key: 'role', label: t('team:columns.role') },
                    { key: 'setup_completed_at', label: t('team:columns.setup') },
                    { key: 'created_at', label: t('team:columns.joined') },
                  ].map(col => (
                    <th
                      key={col.key}
                      className={styles.th}
                      onClick={() => handleSort(col.key)}
                      style={{ cursor: 'pointer', userSelect: 'none', color: sortBy === col.key ? 'var(--color-text)' : undefined }}
                    >
                      {col.label}{sortBy === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
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
                      {m.deleted_at && <span style={{ fontSize: 10, fontWeight: 600, color: '#ef4444', marginLeft: 6, padding: '2px 6px', background: 'rgba(239,68,68,0.1)', borderRadius: 4 }}>{t('team:deleted')}</span>}
                    </td>
                    <td className={styles.td}>{m.email}</td>
                    <td className={styles.td}>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                        {(m.role || 'contractor_user').replace('contractor_', '')}
                      </span>
                    </td>
                    <td className={styles.td}>
                      {m.setup_completed_at ? (
                        <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>{t('team:setupComplete')}</span>
                      ) : (
                        <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>{t('team:setupPending')}</span>
                      )}
                    </td>
                    <td className={styles.td}>{formatDate(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, color: 'var(--color-text-muted)' }}>
          <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
          {t('team:showDeleted')}
        </label>

        {/* Seat request confirmation modal */}
        {showSeatRequest && (
          <Modal onClose={() => setShowSeatRequest(false)}>
            <div style={{ padding: 24, maxWidth: 400 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
                {t('team:seatModal.title')}
              </h3>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
                {t('team:seatModal.body')}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className={styles.secondaryBtn} onClick={() => setShowSeatRequest(false)}>{t('common:action.cancel')}</button>
                <button className={styles.addBtn} onClick={handleSeatRequest} disabled={requestingSeats}>
                  {requestingSeats ? t('team:sending') : t('team:seatModal.sendRequest')}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </main>
    </div>
  )
}
