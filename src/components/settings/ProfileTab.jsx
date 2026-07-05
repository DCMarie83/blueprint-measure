import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useDateFormat } from '../../hooks/useDateFormat'
import { useCompanyPlan } from '../../lib/plans'
import styles from '../../pages/AccountPage.module.css'

const ROLE_LABELS = {
  contractor_user: 'Member',
  contractor_admin: 'Admin',
  super_admin: 'Super Admin',
}

export default function ProfileTab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { formatDate, formatDateTime } = useDateFormat()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileDirty, setProfileDirty] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileToast, setProfileToast] = useState('')

  const [company, setCompany] = useState(null)
  const [companyId, setCompanyId] = useState(null)
  const [role, setRole] = useState('')

  const [smsConsent, setSmsConsent] = useState(false)
  const [smsConsentAt, setSmsConsentAt] = useState(null)
  const [smsSaving, setSmsSaving] = useState(false)

  const [activity, setActivity] = useState([])
  const [activityFilter, setActivityFilter] = useState('all')

  const [dangerOpen, setDangerOpen] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelToast, setCancelToast] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user) return
    async function load() {
      setProfileLoading(true)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, phone, role, sms_consent, sms_consent_at, company_id')
        .eq('user_id', user.id)
        .single()

      let companyData = null
      if (profile?.company_id) {
        const { data: c } = await supabase
          .from('companies')
          .select('name, plan, plan_key, subscription_status, locked_price_monthly, locked_price_annual')
          .eq('id', profile.company_id)
          .single()
        companyData = c
      }

      if (profile) {
        setFullName(profile.full_name ?? '')
        setPhone(profile.phone ?? '')
        setRole(profile.role ?? '')
        setSmsConsent(profile.sms_consent ?? false)
        setSmsConsentAt(profile.sms_consent_at ?? null)
        setCompanyId(profile.company_id ?? null)
      }
      if (companyData) {
        setCompany(companyData)
      }

      const activityItems = []
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, project_name, created_at, blueprint_url')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)

      sessions?.forEach(s => {
        activityItems.push({ type: 'session', text: `Created session "${s.project_name}"`, time: s.created_at, sessionId: s.id })
        if (s.blueprint_url) {
          activityItems.push({ type: 'upload', text: `Uploaded blueprint for "${s.project_name}"`, time: s.created_at, sessionId: s.id })
        }
      })

      const sessionIds = sessions?.map(s => s.id) ?? []
      if (sessionIds.length) {
        const { data: zones } = await supabase
          .from('zones')
          .select('name, created_at, session_id')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: false })
          .limit(30)
        zones?.forEach(z => {
          activityItems.push({ type: 'zone', text: `Measured ${z.name}`, time: z.created_at, sessionId: z.session_id })
        })
      }

      activityItems.sort((a, b) => new Date(b.time) - new Date(a.time))
      setActivity(activityItems.slice(0, 20))
      setProfileLoading(false)
    }
    load()
  }, [user])

  async function handleSaveProfile(e) {
    e.preventDefault()
    setProfileSaving(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
        .eq('user_id', user.id)
      if (error) throw new Error(error.message)
      setProfileDirty(false)
      setProfileToast('Saved')
      setTimeout(() => setProfileToast(''), 2000)
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleToggleSms() {
    const newValue = !smsConsent
    setSmsSaving(true)
    try {
      const update = { sms_consent: newValue }
      if (newValue) update.sms_consent_at = new Date().toISOString()
      const { error } = await supabase
        .from('user_profiles')
        .update(update)
        .eq('user_id', user.id)
      if (error) throw new Error(error.message)
      setSmsConsent(newValue)
      if (newValue) setSmsConsentAt(update.sms_consent_at)
    } catch (err) {
      alert('Failed to update SMS preference: ' + err.message)
    } finally {
      setSmsSaving(false)
    }
  }

  async function handleCancelSubscription() {
    setCancelling(true)
    try {
      const { data, error } = await supabase.functions.invoke('recurly-cancel', {
        body: { company_id: companyId, reason: cancelReason.trim() || undefined },
      })
      if (error) throw new Error(error.message || 'Cancellation failed')
      if (data?.error) throw new Error(data.error)
      setCancelConfirm(false)
      setCancelReason('')
      setCancelToast('Your subscription has been canceled. You will retain access until the end of your current billing period.')
      setTimeout(() => setCancelToast(''), 8000)
    } catch (err) {
      alert('Failed to cancel: ' + err.message)
    } finally {
      setCancelling(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (error) throw new Error(error.message)
      sessionStorage.removeItem('bpm_password_recovery_pending')
      await supabase.auth.signOut()
      navigate('/login')
    } catch (err) {
      alert('Failed to delete account: ' + err.message)
      setDeleting(false)
    }
  }

  const companyPlan = useCompanyPlan(company)

  const filteredActivity = activityFilter === 'all'
    ? activity
    : activity.filter(a => {
        if (activityFilter === 'sessions') return a.type === 'session'
        if (activityFilter === 'zones') return a.type === 'zone'
        if (activityFilter === 'blueprints') return a.type === 'upload'
        return true
      })

  if (profileLoading) {
    return <div className={styles.center}>Loading…</div>
  }

  return (
    <>
      {/* Profile */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Profile</h2>
        <form onSubmit={handleSaveProfile} className={styles.form}>
          <label className={styles.label}>
            Full Name
            <input className={styles.input} value={fullName} onChange={e => { setFullName(e.target.value); setProfileDirty(true) }} placeholder="Your full name" />
          </label>
          <label className={styles.label}>
            Email
            <input className={styles.input} value={user?.email ?? ''} disabled />
            <span className={styles.hint}>Contact support to change email</span>
          </label>
          <label className={styles.label}>
            Phone
            <input className={styles.input} value={phone} onChange={e => { setPhone(e.target.value); setProfileDirty(true) }} placeholder="(555) 123-4567" />
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.saveBtn} disabled={!profileDirty || profileSaving}>
              {profileSaving ? 'Saving…' : 'Save Changes'}
            </button>
            {profileToast && <span className={styles.toast}>{profileToast}</span>}
          </div>
        </form>
      </section>

      {/* Company */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Company</h2>
        <div className={styles.infoRow}><span className={styles.infoLabel}>Company</span><span className={styles.infoValue}>{company?.name ?? 'Not assigned'}</span></div>
        <div className={styles.infoRow}><span className={styles.infoLabel}>Plan</span><span className={styles.planBadge}>{companyPlan?.display_name ?? '—'}</span></div>
        <div className={styles.infoRow}><span className={styles.infoLabel}>Role</span><span className={styles.infoValue}>{role ? (ROLE_LABELS[role] ?? role) : 'Member'}</span></div>
        <p className={styles.hint}>Contact your admin to change company details.</p>
      </section>

      {/* Password */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Password</h2>
        <Link to="/change-password" className={styles.changePasswordLink}>Change Password</Link>
      </section>

      {/* SMS Preferences */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>SMS Preferences</h2>
        <div className={styles.smsRow}>
          <label className={styles.smsToggle}>
            <input type="checkbox" checked={smsConsent} onChange={handleToggleSms} disabled={smsSaving} />
            <span className={styles.smsLabel}>Receive SMS notifications</span>
          </label>
          {smsConsentAt && smsConsent && (
            <span className={styles.hint}>Opted in {formatDate(smsConsentAt)}</span>
          )}
        </div>
        <p className={styles.smsDisclosure}>
          I agree to receive automated text messages from NG Automation Hub
          at the phone number provided, including product updates, support communications, and
          occasional marketing. Message and data rates may apply. Reply STOP to opt out, HELP for help.
        </p>
      </section>

      {/* Activity */}
      {activity.length > 0 && (
        <section className={styles.card}>
          <div className={styles.activityHeader}>
            <h2 className={styles.cardTitle} style={{ margin: 0 }}>My Activity</h2>
            <select className={styles.activityFilterSelect} value={activityFilter} onChange={e => setActivityFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="sessions">Sessions</option>
              <option value="zones">Zones</option>
              <option value="blueprints">Blueprints</option>
            </select>
          </div>
          <div className={styles.activityList}>
            {filteredActivity.map((item, i) => (
              <div key={i} className={styles.activityItemClickable} onClick={() => item.sessionId && navigate(`/session/${item.sessionId}`)}>
                <span className={styles.activityText}>{item.text}</span>
                <span className={styles.activityTime}>{formatDateTime(item.time)}</span>
              </div>
            ))}
            {filteredActivity.length === 0 && (
              <p className={styles.hint} style={{ padding: '12px 0' }}>No activity for this filter.</p>
            )}
          </div>
        </section>
      )}

      {/* Subscription & Account */}
      <section className={styles.card}>
        <button className={styles.dangerToggle} onClick={() => setDangerOpen(v => !v)}>
          {dangerOpen ? '▾' : '▸'} Subscription & Account
        </button>
        {dangerOpen && (
          <div className={styles.dangerContent}>
            {cancelToast ? (
              <div className={styles.cancelToast}>{cancelToast}</div>
            ) : !cancelConfirm ? (
              <button className={styles.cancelSubBtn} onClick={() => setCancelConfirm(true)}>Cancel My Subscription</button>
            ) : (
              <div className={styles.deleteConfirm}>
                <p className={styles.cancelWarning}>
                  Cancel your subscription? Your account stays active until the end of your current
                  billing period. After that, your account becomes read-only. You can resubscribe anytime.
                </p>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Optional: why are you canceling? (helps us improve)"
                  rows={2}
                  style={{ width: '100%', marginBottom: 12, padding: '8px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
                <div className={styles.deleteActions}>
                  <button className={styles.cancelBtn} onClick={() => { setCancelConfirm(false); setCancelReason('') }}>Keep Subscription</button>
                  <button className={styles.confirmCancelBtn} onClick={handleCancelSubscription} disabled={cancelling}>
                    {cancelling ? 'Canceling…' : 'Confirm Cancellation'}
                  </button>
                </div>
              </div>
            )}
            <div className={styles.deleteSectionSeparator} />
            {!deleteConfirm ? (
              <button className={styles.deleteLink} onClick={() => setDeleteConfirm(true)}>Request Permanent Account Deletion</button>
            ) : (
              <div className={styles.deleteConfirm}>
                <p className={styles.deleteWarning}>
                  Permanently delete your account? This will remove all your sessions, zones, and uploads.
                  This action cannot be undone and is processed within 30 days per our retention policy.
                </p>
                <div className={styles.deleteActions}>
                  <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(false)}>Cancel</button>
                  <button className={styles.confirmDeleteBtn} onClick={handleDeleteAccount} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete My Account'}
                  </button>
                </div>
              </div>
            )}
            <p className={styles.dangerFootnote}>
              Cancellation takes effect at the end of your current billing period.
            </p>
          </div>
        )}
      </section>
    </>
  )
}
