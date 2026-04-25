import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import styles from './AccountPage.module.css'

const ADMIN_EMAIL = 'main@ngautomationhub.com'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function AccountPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Profile
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileDirty, setProfileDirty] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileToast, setProfileToast] = useState('')

  // Company
  const [company, setCompany] = useState(null)
  const [role, setRole] = useState('')

  // SMS consent
  const [smsConsent, setSmsConsent] = useState(false)
  const [smsConsentAt, setSmsConsentAt] = useState(null)
  const [smsSaving, setSmsSaving] = useState(false)

  // Activity
  const [activity, setActivity] = useState([])

  // Danger zone
  const [dangerOpen, setDangerOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Load profile and related data
  useEffect(() => {
    if (!user) return
    async function load() {
      setProfileLoading(true)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name, phone, role, sms_consent, sms_consent_at, company_id, companies(name, plan)')
        .eq('user_id', user.id)
        .single()

      if (profile) {
        setFullName(profile.full_name ?? '')
        setPhone(profile.phone ?? '')
        setRole(profile.role ?? 'contractor_user')
        setSmsConsent(profile.sms_consent ?? false)
        setSmsConsentAt(profile.sms_consent_at ?? null)
        if (profile.companies) {
          setCompany({ name: profile.companies.name, plan: profile.companies.plan })
        }
      }

      // Activity — derive from sessions + zones
      const activityItems = []
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, project_name, created_at, blueprint_url')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)

      sessions?.forEach(s => {
        activityItems.push({ text: `Created session "${s.project_name}"`, time: s.created_at })
        if (s.blueprint_url) {
          activityItems.push({ text: `Uploaded blueprint for "${s.project_name}"`, time: s.created_at })
        }
      })

      const sessionIds = sessions?.map(s => s.id) ?? []
      if (sessionIds.length) {
        const { data: zones } = await supabase
          .from('zones')
          .select('name, created_at')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: false })
          .limit(30)
        zones?.forEach(z => {
          activityItems.push({ text: `Measured ${z.name}`, time: z.created_at })
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
      // Only set sms_consent_at when opting in (preserves original opt-in timestamp on opt-out)
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

  // Requires user_profiles.deleted_at timestamptz column.
  async function handleDeleteAccount() {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (error) throw new Error(error.message)
      await supabase.auth.signOut()
      navigate('/login')
    } catch (err) {
      alert('Failed to delete account: ' + err.message)
      setDeleting(false)
    }
  }

  const ROLE_LABELS = {
    contractor_user: 'User',
    contractor_admin: 'Admin',
    super_admin: 'Super Admin',
  }

  if (profileLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>Loading…</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/dashboard" className={styles.backLink}>← Back to Dashboard</Link>
        <h1 className={styles.pageTitle}>My Account</h1>
      </header>

      <main className={styles.main}>
        {/* 1. Profile */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Profile</h2>
          <form onSubmit={handleSaveProfile} className={styles.form}>
            <label className={styles.label}>
              Full Name
              <input
                className={styles.input}
                value={fullName}
                onChange={e => { setFullName(e.target.value); setProfileDirty(true) }}
                placeholder="Your full name"
              />
            </label>
            <label className={styles.label}>
              Email
              <input className={styles.input} value={user?.email ?? ''} disabled />
              <span className={styles.hint}>Contact support to change email</span>
            </label>
            <label className={styles.label}>
              Phone
              <input
                className={styles.input}
                value={phone}
                onChange={e => { setPhone(e.target.value); setProfileDirty(true) }}
                placeholder="(555) 123-4567"
              />
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={styles.saveBtn} disabled={!profileDirty || profileSaving}>
                {profileSaving ? 'Saving…' : 'Save Changes'}
              </button>
              {profileToast && <span className={styles.toast}>{profileToast}</span>}
            </div>
          </form>
        </section>

        {/* 2. Company */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Company</h2>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Company</span>
            <span className={styles.infoValue}>{company?.name ?? '—'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Plan</span>
            <span className={styles.planBadge}>{company?.plan ?? '—'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Role</span>
            <span className={styles.infoValue}>{ROLE_LABELS[role] ?? role}</span>
          </div>
          <p className={styles.hint}>Contact your admin to change company details.</p>
        </section>

        {/* 3. Password */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Password</h2>
          <Link to="/change-password" className={styles.changePasswordLink}>
            Change Password
          </Link>
        </section>

        {/* 4. SMS Preferences */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>SMS Preferences</h2>
          <div className={styles.smsRow}>
            <label className={styles.smsToggle}>
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={handleToggleSms}
                disabled={smsSaving}
              />
              <span className={styles.smsLabel}>Receive SMS notifications</span>
            </label>
            {smsConsentAt && smsConsent && (
              <span className={styles.hint}>
                Opted in {new Date(smsConsentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
          <p className={styles.smsDisclosure}>
            I agree to receive automated text messages from BlueprintMeasure (NG Automation Hub)
            at the phone number provided, including product updates, support communications, and
            occasional marketing. Message and data rates may apply. Reply STOP to opt out, HELP for help.
          </p>
        </section>

        {/* 5. My Activity */}
        {activity.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>My Activity</h2>
            <div className={styles.activityList}>
              {activity.map((item, i) => (
                <div key={i} className={styles.activityItem}>
                  <span className={styles.activityText}>{item.text}</span>
                  <span className={styles.activityTime}>
                    {new Date(item.time).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 6. Danger Zone */}
        <section className={styles.card}>
          <button className={styles.dangerToggle} onClick={() => setDangerOpen(v => !v)}>
            {dangerOpen ? '▾' : '▸'} Danger Zone
          </button>
          {dangerOpen && (
            <div className={styles.dangerContent}>
              {!deleteConfirm ? (
                <button className={styles.deleteAccountBtn} onClick={() => setDeleteConfirm(true)}>
                  Delete My Account
                </button>
              ) : (
                <div className={styles.deleteConfirm}>
                  <p className={styles.deleteWarning}>
                    This will permanently delete your account and all your sessions, zones, and uploads.
                    Your company data will be transferred to your admin. This action cannot be undone.
                  </p>
                  <div className={styles.deleteActions}>
                    <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(false)}>
                      Cancel
                    </button>
                    <button className={styles.confirmDeleteBtn} onClick={handleDeleteAccount} disabled={deleting}>
                      {deleting ? 'Deleting…' : 'Confirm Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
