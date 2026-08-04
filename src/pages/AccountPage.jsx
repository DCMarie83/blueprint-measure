import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import UserMenu from '../components/UserMenu'
import { useDateFormat } from '../hooks/useDateFormat'
import { BRAND } from '../lib/config'
import { useCompanyPlan } from '../lib/plans'
import styles from './AccountPage.module.css'

// Values are i18n key strings; the consuming component wraps them with t().
const ROLE_LABELS = {
  contractor_user: 'misc:account.role.member',
  contractor_admin: 'common:role.contractor_admin',
  super_admin: 'common:role.super_admin',
}

export default function AccountPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { formatDate, formatDateTime } = useDateFormat()

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
  const [activityFilter, setActivityFilter] = useState('all')

  // Danger zone
  const [dangerOpen, setDangerOpen] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelToast, setCancelToast] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Load profile and related data
  useEffect(() => {
    if (!user) return
    async function load() {
      setProfileLoading(true)
      // Split into two queries to avoid FK join into companies (RLS blocks the embed)
      const { data: profile, error: profileErr } = await supabase
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
      }
      if (companyData) {
        setCompany(companyData)
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
        activityItems.push({ type: 'session', text: t('misc:account.activity.createdSession', { name: s.project_name }), time: s.created_at, sessionId: s.id })
        if (s.blueprint_url) {
          activityItems.push({ type: 'upload', text: t('misc:account.activity.uploadedBlueprint', { name: s.project_name }), time: s.created_at, sessionId: s.id })
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
          activityItems.push({ type: 'zone', text: t('misc:account.activity.measured', { name: z.name }), time: z.created_at, sessionId: z.session_id })
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
      setProfileToast(t('misc:account.profile.savedToast'))
      setTimeout(() => setProfileToast(''), 2000)
    } catch (err) {
      alert(t('misc:account.errors.saveFailed', { error: err.message }))
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
      alert(t('misc:account.errors.smsFailed', { error: err.message }))
    } finally {
      setSmsSaving(false)
    }
  }

  // Requires: alter table user_profiles add column if not exists subscription_cancel_requested_at timestamptz;
  async function handleCancelSubscription() {
    setCancelling(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ subscription_cancel_requested_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (error) throw new Error(error.message)
      setCancelConfirm(false)
      setCancelToast(t('misc:account.danger.cancelToast'))
      setTimeout(() => setCancelToast(''), 5000)
    } catch (err) {
      alert(t('misc:account.errors.cancelFailed', { error: err.message }))
    } finally {
      setCancelling(false)
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
      sessionStorage.removeItem('bpm_password_recovery_pending')
      await supabase.auth.signOut()
      navigate('/login')
    } catch (err) {
      alert(t('misc:account.errors.deleteFailed', { error: err.message }))
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
    return (
      <div className={styles.page}>
        <div className={styles.center}>{t('misc:account.loading')}</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1 }}>
          <Link to="/dashboard" className={styles.backLink}>{t('misc:account.backToDashboard')}</Link>
          <h1 className={styles.pageTitle} style={{ margin: 0 }}>{t('misc:account.title')}</h1>
        </div>
        <UserMenu />
      </header>

      <main className={styles.main}>
        {/* 1. Profile */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('misc:account.profile.heading')}</h2>
          <form onSubmit={handleSaveProfile} className={styles.form}>
            <label className={styles.label}>
              {t('misc:account.profile.fullName')}
              <input
                className={styles.input}
                value={fullName}
                onChange={e => { setFullName(e.target.value); setProfileDirty(true) }}
                placeholder={t('misc:account.profile.fullNamePlaceholder')}
              />
            </label>
            <label className={styles.label}>
              {t('misc:account.profile.email')}
              <input className={styles.input} value={user?.email ?? ''} disabled />
              <span className={styles.hint}>{t('misc:account.profile.emailHint')}</span>
            </label>
            <label className={styles.label}>
              {t('misc:account.profile.phone')}
              <input
                className={styles.input}
                value={phone}
                onChange={e => { setPhone(e.target.value); setProfileDirty(true) }}
                placeholder={t('misc:account.profile.phonePlaceholder')}
              />
            </label>
            <div className={styles.formActions}>
              <button type="submit" className={styles.saveBtn} disabled={!profileDirty || profileSaving}>
                {profileSaving ? t('misc:account.saving') : t('common:action.saveChanges')}
              </button>
              {profileToast && <span className={styles.toast}>{profileToast}</span>}
            </div>
          </form>
        </section>

        {/* 2. Company */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('misc:account.company.heading')}</h2>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t('misc:account.company.companyLabel')}</span>
            <span className={styles.infoValue}>{company?.name ?? t('misc:account.company.notAssigned')}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t('misc:account.company.plan')}</span>
            <span className={styles.planBadge}>{companyPlan?.display_name ?? '—'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t('misc:account.company.role')}</span>
            <span className={styles.infoValue}>{role ? t(ROLE_LABELS[role] ?? role) : t('misc:account.role.member')}</span>
          </div>
          <p className={styles.hint}>{t('misc:account.company.hint')}</p>
        </section>

        {/* 3. Password */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('misc:account.password.heading')}</h2>
          <Link to="/change-password" className={styles.changePasswordLink}>
            {t('misc:account.password.change')}
          </Link>
        </section>

        {/* 4. SMS Preferences */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t('misc:account.sms.heading')}</h2>
          <div className={styles.smsRow}>
            <label className={styles.smsToggle}>
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={handleToggleSms}
                disabled={smsSaving}
              />
              <span className={styles.smsLabel}>{t('misc:account.sms.receive')}</span>
            </label>
            {smsConsentAt && smsConsent && (
              <span className={styles.hint}>
                {t('misc:account.sms.optedIn', { date: formatDate(smsConsentAt) })}
              </span>
            )}
          </div>
          <p className={styles.smsDisclosure}>
            {t('misc:account.sms.disclosure', { brand: BRAND.name, legalEntity: BRAND.legalEntity })}
          </p>
        </section>

        {/* 5. My Activity */}
        {activity.length > 0 && (
          <section className={styles.card}>
            <div className={styles.activityHeader}>
              <h2 className={styles.cardTitle} style={{ margin: 0 }}>{t('misc:account.activity.heading')}</h2>
              <select
                className={styles.activityFilterSelect}
                value={activityFilter}
                onChange={e => setActivityFilter(e.target.value)}
              >
                <option value="all">{t('misc:account.activity.all')}</option>
                <option value="sessions">{t('misc:account.activity.sessions')}</option>
                <option value="zones">{t('misc:account.activity.zones')}</option>
                <option value="blueprints">{t('misc:account.activity.blueprints')}</option>
              </select>
            </div>
            <div className={styles.activityList}>
              {filteredActivity.map((item, i) => (
                <div
                  key={i}
                  className={styles.activityItemClickable}
                  onClick={() => item.sessionId && navigate(`/session/${item.sessionId}`)}
                >
                  <span className={styles.activityText}>{item.text}</span>
                  <span className={styles.activityTime}>
                    {formatDateTime(item.time)}
                  </span>
                </div>
              ))}
              {filteredActivity.length === 0 && (
                <p className={styles.hint} style={{ padding: '12px 0' }}>{t('misc:account.activity.empty')}</p>
              )}
            </div>
          </section>
        )}

        {/* 6. Subscription & Account */}
        <section className={styles.card}>
          <button className={styles.dangerToggle} onClick={() => setDangerOpen(v => !v)}>
            {dangerOpen ? '▾' : '▸'} {t('misc:account.danger.heading')}
          </button>
          {dangerOpen && (
            <div className={styles.dangerContent}>
              {/* Primary: Cancel Subscription */}
              {cancelToast ? (
                <div className={styles.cancelToast}>{cancelToast}</div>
              ) : !cancelConfirm ? (
                <button className={styles.cancelSubBtn} onClick={() => setCancelConfirm(true)}>
                  {t('misc:account.danger.cancelSub')}
                </button>
              ) : (
                <div className={styles.deleteConfirm}>
                  <p className={styles.cancelWarning}>
                    {t('misc:account.danger.cancelWarning')}
                  </p>
                  <div className={styles.deleteActions}>
                    <button className={styles.cancelBtn} onClick={() => setCancelConfirm(false)}>
                      {t('misc:account.danger.keepSub')}
                    </button>
                    <button className={styles.confirmCancelBtn} onClick={handleCancelSubscription} disabled={cancelling}>
                      {cancelling ? t('misc:account.danger.processing') : t('misc:account.danger.confirmCancel')}
                    </button>
                  </div>
                </div>
              )}

              {/* Secondary: Delete Account */}
              <div className={styles.deleteSectionSeparator} />
              {!deleteConfirm ? (
                <button className={styles.deleteLink} onClick={() => setDeleteConfirm(true)}>
                  {t('misc:account.danger.requestDeletion')}
                </button>
              ) : (
                <div className={styles.deleteConfirm}>
                  <p className={styles.deleteWarning}>
                    {t('misc:account.danger.deleteWarning')}
                  </p>
                  <div className={styles.deleteActions}>
                    <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(false)}>
                      {t('common:action.cancel')}
                    </button>
                    <button className={styles.confirmDeleteBtn} onClick={handleDeleteAccount} disabled={deleting}>
                      {deleting ? t('misc:account.danger.deleting') : t('misc:account.danger.deleteAccount')}
                    </button>
                  </div>
                </div>
              )}

              <p className={styles.dangerFootnote}>
                {t('misc:account.danger.footnote')}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
