import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useImpersonation } from '../../context/ImpersonationContext'
import { useDateFormat } from '../../hooks/useDateFormat'
import { useCompanyPlan } from '../../lib/plans'
import styles from '../../pages/AccountPage.module.css'

const ROLE_LABELS = {
  contractor_user: 'settings:profile.roleMember',
  contractor_admin: 'common:role.contractor_admin',
  super_admin: 'common:role.super_admin',
}

export default function ProfileTab() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { isImpersonating } = useImpersonation()
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
  const [reactivating, setReactivating] = useState(false)
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
          .select('name, plan, plan_key, subscription_status, locked_price_monthly, locked_price_annual, canceled_at')
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
        activityItems.push({ type: 'session', text: t('settings:profile.activity.createdSession', { name: s.project_name }), time: s.created_at, sessionId: s.id })
        if (s.blueprint_url) {
          activityItems.push({ type: 'upload', text: t('settings:profile.activity.uploadedBlueprint', { name: s.project_name }), time: s.created_at, sessionId: s.id })
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
          activityItems.push({ type: 'zone', text: t('settings:profile.activity.measured', { name: z.name }), time: z.created_at, sessionId: z.session_id })
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
      setProfileToast(t('settings:profile.savedToast'))
      setTimeout(() => setProfileToast(''), 2000)
    } catch (err) {
      alert(t('settings:profile.saveFailed', { message: err.message }))
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
      alert(t('settings:profile.smsUpdateFailed', { message: err.message }))
    } finally {
      setSmsSaving(false)
    }
  }

  async function handleCancelSubscription() {
    if (isImpersonating) {
      setCancelToast(t('common:guard.impersonationBilling'))
      setTimeout(() => setCancelToast(''), 5000)
      return
    }
    setCancelling(true)
    try {
      const { data, error } = await supabase.functions.invoke('recurly-cancel', {
        body: { company_id: companyId, reason: cancelReason.trim() || undefined },
      })
      if (error) throw new Error(error.message || t('settings:profile.cancelFailedFallback'))
      if (data?.error) throw new Error(data.error)
      setCancelConfirm(false)
      setCancelReason('')
      setCancelToast(t('settings:profile.cancelSuccess'))
      setTimeout(() => setCancelToast(''), 8000)
    } catch (err) {
      alert(t('settings:profile.cancelFailed', { message: err.message }))
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
      alert(t('settings:profile.deleteFailed', { message: err.message }))
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
    return <div className={styles.center}>{t('common:misc.loading')}</div>
  }

  return (
    <>
      {/* Profile */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('settings:profile.title')}</h2>
        <form onSubmit={handleSaveProfile} className={styles.form}>
          <label className={styles.label}>
            {t('settings:profile.fullName')}
            <input className={styles.input} value={fullName} onChange={e => { setFullName(e.target.value); setProfileDirty(true) }} placeholder={t('settings:profile.fullNamePlaceholder')} />
          </label>
          <label className={styles.label}>
            {t('settings:profile.email')}
            <input className={styles.input} value={user?.email ?? ''} disabled />
            <span className={styles.hint}>{t('settings:profile.emailHint')}</span>
          </label>
          <label className={styles.label}>
            {t('settings:profile.phone')}
            <input className={styles.input} value={phone} onChange={e => { setPhone(e.target.value); setProfileDirty(true) }} placeholder="(555) 123-4567" />
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.saveBtn} disabled={!profileDirty || profileSaving}>
              {profileSaving ? t('settings:profile.saving') : t('common:action.saveChanges')}
            </button>
            {profileToast && <span className={styles.toast}>{profileToast}</span>}
          </div>
        </form>
      </section>

      {/* Company */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('settings:profile.companyTitle')}</h2>
        <div className={styles.infoRow}><span className={styles.infoLabel}>{t('settings:profile.companyLabel')}</span><span className={styles.infoValue}>{company?.name ?? t('settings:profile.notAssigned')}</span></div>
        <div className={styles.infoRow}><span className={styles.infoLabel}>{t('settings:profile.planLabel')}</span><span className={styles.planBadge}>{companyPlan?.display_name ?? '—'}</span></div>
        <div className={styles.infoRow}><span className={styles.infoLabel}>{t('settings:profile.roleLabel')}</span><span className={styles.infoValue}>{role ? (ROLE_LABELS[role] ? t(ROLE_LABELS[role]) : role) : t('settings:profile.roleMember')}</span></div>
        <p className={styles.hint}>{t('settings:profile.companyHint')}</p>
      </section>

      {/* Password */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('settings:profile.passwordTitle')}</h2>
        <Link to="/change-password" className={styles.changePasswordLink}>{t('settings:profile.changePassword')}</Link>
      </section>

      {/* SMS Preferences */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t('settings:profile.smsTitle')}</h2>
        <div className={styles.smsRow}>
          <label className={styles.smsToggle}>
            <input type="checkbox" checked={smsConsent} onChange={handleToggleSms} disabled={smsSaving} />
            <span className={styles.smsLabel}>{t('settings:profile.smsReceive')}</span>
          </label>
          {smsConsentAt && smsConsent && (
            <span className={styles.hint}>{t('settings:profile.optedIn', { date: formatDate(smsConsentAt) })}</span>
          )}
        </div>
        <p className={styles.smsDisclosure}>
          {t('settings:profile.smsDisclosure')}
        </p>
      </section>

      {/* Activity */}
      {activity.length > 0 && (
        <section className={styles.card}>
          <div className={styles.activityHeader}>
            <h2 className={styles.cardTitle} style={{ margin: 0 }}>{t('settings:profile.activityTitle')}</h2>
            <select className={styles.activityFilterSelect} value={activityFilter} onChange={e => setActivityFilter(e.target.value)}>
              <option value="all">{t('settings:profile.filter.all')}</option>
              <option value="sessions">{t('settings:profile.filter.sessions')}</option>
              <option value="zones">{t('settings:profile.filter.zones')}</option>
              <option value="blueprints">{t('settings:profile.filter.blueprints')}</option>
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
              <p className={styles.hint} style={{ padding: '12px 0' }}>{t('settings:profile.noActivity')}</p>
            )}
          </div>
        </section>
      )}

      {/* Subscription & Account */}
      <section className={styles.card}>
        <button className={styles.dangerToggle} onClick={() => setDangerOpen(v => !v)}>
          {dangerOpen ? '▾' : '▸'} {t('settings:profile.subscriptionAccount')}
        </button>
        {dangerOpen && (
          <div className={styles.dangerContent}>
            {company?.canceled_at && !['active', 'pilot'].includes(company?.subscription_status) ? (
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 8 }}>{t('settings:profile.subscriptionCanceled')}</p>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>
                  {company.subscription_status === 'canceled'
                    ? t('settings:profile.subscriptionEnded')
                    : t('settings:profile.cancellationConfirmed')}
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
                  {t('settings:profile.canceledOn', { date: new Date(company.canceled_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) })}
                </p>
                {company.subscription_status === 'canceled' ? (
                  <button
                    onClick={() => navigate('/subscribe')}
                    style={{
                      padding: '10px 20px', fontSize: 14, fontWeight: 600,
                      background: '#f27243', color: '#fff', border: 'none', borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('settings:profile.resubscribe')}
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (isImpersonating) {
                        setCancelToast(t('common:guard.impersonationBilling'))
                        setTimeout(() => setCancelToast(''), 5000)
                        return
                      }
                      setReactivating(true)
                      try {
                        const { data, error } = await supabase.functions.invoke('recurly-reactivate', {
                          body: { company_id: companyId },
                        })
                        if (error) throw new Error(error.message || t('settings:profile.reactivateFailedFallback'))
                        if (data?.error) throw new Error(data.error)
                        const { data: c } = await supabase
                          .from('companies')
                          .select('name, plan, plan_key, subscription_status, locked_price_monthly, locked_price_annual, canceled_at')
                          .eq('id', companyId)
                          .single()
                        if (c) setCompany(c)
                        setCancelToast(t('settings:profile.reactivateSuccess'))
                        setTimeout(() => setCancelToast(''), 5000)
                      } catch (err) {
                        alert(t('settings:profile.reactivateFailed', { message: err.message }))
                      } finally {
                        setReactivating(false)
                      }
                    }}
                    disabled={reactivating}
                    style={{
                      padding: '10px 20px', fontSize: 14, fontWeight: 600,
                      background: '#f27243', color: '#fff', border: 'none', borderRadius: 'var(--radius)',
                      cursor: reactivating ? 'wait' : 'pointer',
                      opacity: reactivating ? 0.6 : 1,
                    }}
                  >
                    {reactivating ? t('settings:profile.reactivating') : t('settings:profile.reactivateSubscription')}
                  </button>
                )}
              </div>
            ) : cancelToast ? (
              <div className={styles.cancelToast}>{cancelToast}</div>
            ) : !cancelConfirm ? (
              <button className={styles.cancelSubBtn} onClick={() => setCancelConfirm(true)}>{t('settings:profile.cancelMySubscription')}</button>
            ) : (
              <div className={styles.deleteConfirm}>
                <p className={styles.cancelWarning}>
                  {t('settings:profile.cancelWarning')}
                </p>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder={t('settings:profile.cancelReasonPlaceholder')}
                  rows={2}
                  style={{ width: '100%', marginBottom: 12, padding: '8px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
                <div className={styles.deleteActions}>
                  <button className={styles.cancelBtn} onClick={() => { setCancelConfirm(false); setCancelReason('') }}>{t('settings:profile.keepSubscription')}</button>
                  <button className={styles.confirmCancelBtn} onClick={handleCancelSubscription} disabled={cancelling}>
                    {cancelling ? t('settings:profile.canceling') : t('settings:profile.confirmCancellation')}
                  </button>
                </div>
              </div>
            )}
            <div className={styles.deleteSectionSeparator} />
            {!deleteConfirm ? (
              <button className={styles.deleteLink} onClick={() => setDeleteConfirm(true)}>{t('settings:profile.requestDeletion')}</button>
            ) : (
              <div className={styles.deleteConfirm}>
                <p className={styles.deleteWarning}>
                  {t('settings:profile.deleteWarning')}
                </p>
                <div className={styles.deleteActions}>
                  <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(false)}>{t('common:action.cancel')}</button>
                  <button className={styles.confirmDeleteBtn} onClick={handleDeleteAccount} disabled={deleting}>
                    {deleting ? t('settings:profile.deleting') : t('settings:profile.deleteMyAccount')}
                  </button>
                </div>
              </div>
            )}
            <p className={styles.dangerFootnote}>
              {t('settings:profile.dangerFootnote')}
            </p>
          </div>
        )}
      </section>
    </>
  )
}
