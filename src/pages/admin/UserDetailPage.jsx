import { useState, useEffect, useCallback, Fragment } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useImpersonation } from '../../context/ImpersonationContext'
import { useDateFormat } from '../../hooks/useDateFormat'
import Modal from '../../components/ui/Modal'
import EnterAccountModal from '../../components/admin/EnterAccountModal'
import BackLink from '../../components/BackLink'
import styles from './sections.module.css'

const SEVERITY_COLORS = {
  info: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  warning: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
  error: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  critical: { bg: 'rgba(220,38,38,0.15)', color: '#dc2626' },
}

function SeverityBadge({ severity }) {
  const s = SEVERITY_COLORS[severity] || SEVERITY_COLORS.error
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: s.bg, color: s.color, textTransform: 'uppercase' }}>
      {severity}
    </span>
  )
}

function timeAgo(dateStr, t) {
  if (!dateStr) return '-'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('admin:userDetail.justNow')
  if (mins < 60) return t('admin:userDetail.minAgo', { mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('admin:userDetail.hourAgo', { hrs })
  const days = Math.floor(hrs / 24)
  if (days < 7) return t('admin:userDetail.dayAgo', { days })
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function UserDetailPage() {
  const { t } = useTranslation()
  const { userId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user: currentUser, isSuperAdmin } = useAuth()
  const { startImpersonation } = useImpersonation()
  const { formatDate, formatDateTime, formatTime } = useDateFormat()
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [showEnterAccount, setShowEnterAccount] = useState(false)

  const [profile, setProfile] = useState(null)
  const [companies, setCompanies] = useState([])
  const [authInfo, setAuthInfo] = useState(null) // { last_sign_in_at, banned_until }
  const [recentErrors, setRecentErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [toast, setToast] = useState(null)
  const [expandedErrorId, setExpandedErrorId] = useState(null)

  // Inline edit state
  const [editField, setEditField] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  // Action state
  const [actionLoading, setActionLoading] = useState(null) // 'reset_password' | 'suspend' | etc
  const [confirmDelete, setConfirmDelete] = useState(false)

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const loadProfile = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setProfile(data)
    setLoading(false)
  }, [userId])

  // Determine current user's role for link routing
  useEffect(() => {
    if (!currentUser) return
    if (isSuperAdmin) { setCurrentUserRole('super_admin'); return }
    async function loadRole() {
      const { data } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', currentUser.id)
        .maybeSingle()
      setCurrentUserRole(data?.role || 'contractor_user')
    }
    loadRole()
  }, [currentUser])

  useEffect(() => {
    async function load() {
      // Load profile, companies, auth info, and errors in parallel
      const [profileRes, companiesRes, errorsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('companies').select('id, name').order('name'),
        supabase.from('client_errors').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      ])

      if (profileRes.error || !profileRes.data) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setProfile(profileRes.data)
      setCompanies(companiesRes.data ?? [])
      setRecentErrors(errorsRes.data ?? [])

      // Get auth info from edge function
      try {
        const { data } = await supabase.functions.invoke('admin-user-actions', {
          body: { action: 'get_user_info', target_user_id: userId },
        })
        if (data && !data.error) setAuthInfo(data)
      } catch { /* ignore — non-critical */ }

      setLoading(false)
    }
    load()
  }, [userId])

  async function handleSaveField(fieldName, value) {
    setSaving(true)
    const updateObj = { [fieldName]: value || null }

    const { error } = await supabase
      .from('user_profiles')
      .update(updateObj)
      .eq('user_id', userId)

    if (error) {
      showToast(t('admin:userDetail.updateFailed', { message: error.message }))
    } else {
      setProfile(prev => ({ ...prev, [fieldName]: value || null }))
      showToast(t('admin:userDetail.fieldUpdated', { field: fieldName.replace(/_/g, ' ') }))
    }
    setSaving(false)
    setEditField(null)
  }

  async function handleAction(action) {
    setActionLoading(action)
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-actions', {
        body: { action, target_user_id: userId },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)

      if (action === 'reset_password') {
        showToast(t('admin:userDetail.toastResetSent'))
      } else if (action === 'suspend') {
        setAuthInfo(prev => ({ ...prev, banned_until: '2999-12-31T00:00:00Z' }))
        showToast(t('admin:userDetail.toastDeactivated'))
      } else if (action === 'unsuspend') {
        setAuthInfo(prev => ({ ...prev, banned_until: null }))
        showToast(t('admin:userDetail.toastReactivated'))
      } else if (action === 'soft_delete') {
        setProfile(prev => ({ ...prev, deleted_at: new Date().toISOString() }))
        setAuthInfo(prev => ({ ...prev, banned_until: 'deleted' }))
        setConfirmDelete(false)
        showToast(t('admin:userDetail.toastDeleted'))
      } else if (action === 'restore') {
        setProfile(prev => ({ ...prev, deleted_at: null }))
        setAuthInfo(prev => ({ ...prev, banned_until: null }))
        showToast(t('admin:userDetail.toastRestored'))
      }
    } catch (err) {
      showToast(t('admin:userDetail.actionFailed', { message: err.message }))
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <div className={styles.empty}>{t('admin:userDetail.loading')}</div>
  }

  if (notFound) {
    return (
      <div className={styles.empty}>
        <p>{t('admin:userDetail.notFound')}</p>
        <button className={styles.secondaryBtn} onClick={() => navigate(-1)} style={{ marginTop: 12 }}>{t('admin:userDetail.goBack')}</button>
      </div>
    )
  }

  const isBanned = authInfo?.banned_until && authInfo.banned_until !== 'none' && new Date(authInfo.banned_until) > new Date()
  const isTargetSuperAdmin = profile?.role === 'super_admin'
  const companyName = profile?.company_id ? companies.find(c => c.id === profile.company_id)?.name ?? '-' : '-'
  const initials = (profile?.full_name || profile?.email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div>
      {/* Header with back link */}
      <BackLink
        to={location.pathname.startsWith('/admin/') ? '/admin/users' : '/dashboard/team'}
        label={location.pathname.startsWith('/admin/') ? t('admin:userDetail.backUsers') : t('admin:userDetail.backTeam')}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 className={styles.pageTitle} style={{ margin: 0 }}>
          {profile?.full_name || profile?.email}
          {profile?.deleted_at && <span style={{ fontSize: 12, color: '#ef4444', marginLeft: 8 }}>{t('admin:userDetail.deleted')}</span>}
          {isBanned && <span style={{ fontSize: 12, color: '#f59e0b', marginLeft: 8 }}>{t('admin:userDetail.deactivated')}</span>}
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* LEFT: Profile Card */}
        <div>
          <div className={styles.sectionCard}>
            {/* Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {initials}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{profile?.full_name || '-'}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{profile?.email}</div>
              </div>
            </div>

            {/* Profile fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ProfileField
                label={t('admin:userDetail.fullName')}
                value={profile?.full_name}
                editable={!profile?.deleted_at}
                editField={editField}
                fieldName="full_name"
                editValue={editValue}
                saving={saving}
                onStartEdit={(v) => { setEditField('full_name'); setEditValue(v || '') }}
                onSave={(v) => handleSaveField('full_name', v)}
                onCancel={() => setEditField(null)}
                onChangeValue={setEditValue}
              />
              <ProfileField label={t('admin:userDetail.email')} value={profile?.email} />
              <ProfileField
                label={t('admin:userDetail.phone')}
                value={profile?.phone ? `${profile.phone_country || ''} ${profile.phone}` : null}
                editable={!profile?.deleted_at}
                editField={editField}
                fieldName="phone"
                editValue={editValue}
                saving={saving}
                onStartEdit={(v) => { setEditField('phone'); setEditValue(profile?.phone || '') }}
                onSave={(v) => handleSaveField('phone', v)}
                onCancel={() => setEditField(null)}
                onChangeValue={setEditValue}
              />
              {/* Role */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>{t('admin:userDetail.role')}</span>
                {!isTargetSuperAdmin ? (
                  <select
                    className={styles.roleSelect}
                    value={profile?.role || 'contractor_user'}
                    onChange={async (e) => {
                      const newRole = e.target.value
                      // Only super admin can assign super_admin role
                      if (newRole === 'super_admin' && !isSuperAdmin) return
                      await handleSaveField('role', newRole)
                    }}
                  >
                    <option value="contractor_user">{t('common:role.contractor_user')}</option>
                    <option value="contractor_admin">{t('common:role.contractor_admin')}</option>
                    {isSuperAdmin && <option value="super_admin">{t('common:role.super_admin')}</option>}
                  </select>
                ) : (
                  <span style={{ fontSize: 13 }}>{t('common:role.super_admin')}</span>
                )}
              </div>
              {/* Company */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>{t('admin:userDetail.company')}</span>
                {isSuperAdmin ? (
                  <select
                    className={styles.roleSelect}
                    value={profile?.company_id || ''}
                    onChange={(e) => handleSaveField('company_id', e.target.value || null)}
                  >
                    <option value="">{t('admin:userDetail.noneOption')}</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 13 }}>{companyName}</span>
                )}
              </div>
              {/* Read-only fields */}
              <ProfileField label={t('admin:userDetail.emailConsent')} value={profile?.email_consent ? t('admin:userDetail.yes') : t('admin:userDetail.no')} />
              <ProfileField label={t('admin:userDetail.smsConsent')} value={profile?.sms_consent ? t('admin:userDetail.smsConsentYes', { date: profile.sms_consent_at ? formatDate(profile.sms_consent_at) : '-' }) : t('admin:userDetail.no')} />
              <ProfileField label={t('admin:userDetail.timezone')} value={profile?.timezone || '—'} />
              <ProfileField label={t('admin:userDetail.language')} value={profile?.language || '—'} />
              <ProfileField label={t('admin:userDetail.units')} value={profile?.measurement_units || '—'} />
              <ProfileField label={t('admin:userDetail.cancelRequested')} value={profile?.subscription_cancel_requested_at ? formatDateTime(profile.subscription_cancel_requested_at) : '-'} />
              <ProfileField label={t('admin:userDetail.created')} value={profile?.created_at ? formatDateTime(profile.created_at) : '-'} />
              <ProfileField label={t('admin:userDetail.setupCompleted')} value={profile?.setup_completed_at ? formatDateTime(profile.setup_completed_at) : t('admin:userDetail.setupIncomplete')} />
              <ProfileField label={t('admin:userDetail.lastLogin')} value={authInfo?.last_sign_in_at ? formatDateTime(authInfo.last_sign_in_at) : '-'} />
              {profile?.deleted_at && (
                <ProfileField label={t('admin:userDetail.deletedField')} value={t('admin:userDetail.deactivatedOn', { date: formatDateTime(profile.deleted_at) })} valueStyle={{ color: '#ef4444' }} />
              )}
            </div>
          </div>

          {/* Admin Actions */}
          {!isTargetSuperAdmin && (
            <div className={styles.sectionCard} style={{ marginTop: 16 }}>
              <div className={styles.sectionCardTitle}>{t('admin:userDetail.adminActions')}</div>
              <div className={styles.actionsList}>
                {profile?.company_id && (
                  <button className={styles.addBtn} onClick={() => setShowEnterAccount(true)}>
                    {t('admin:impersonation.enterAccount')}
                  </button>
                )}
                {profile?.deleted_at ? (
                  /* Deleted user — only show Restore */
                  <button
                    className={styles.addBtn}
                    disabled={actionLoading === 'restore'}
                    onClick={() => handleAction('restore')}
                  >
                    {actionLoading === 'restore' ? t('admin:userDetail.restoring') : t('admin:userDetail.restoreUser')}
                  </button>
                ) : (
                  /* Active user — show all actions */
                  <>
                    <button
                      className={styles.secondaryBtn}
                      disabled={actionLoading === 'reset_password'}
                      onClick={() => handleAction('reset_password')}
                    >
                      {actionLoading === 'reset_password' ? t('admin:userDetail.sending') : t('admin:userDetail.sendResetEmail')}
                    </button>

                    {!isBanned ? (
                      <button
                        className={styles.secondaryBtn}
                        style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}
                        disabled={actionLoading === 'suspend'}
                        onClick={() => handleAction('suspend')}
                      >
                        {actionLoading === 'suspend' ? t('admin:userDetail.deactivating') : t('admin:userDetail.deactivateAccount')}
                      </button>
                    ) : (
                      <button
                        className={styles.secondaryBtn}
                        style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}
                        disabled={actionLoading === 'unsuspend'}
                        onClick={() => handleAction('unsuspend')}
                      >
                        {actionLoading === 'unsuspend' ? t('admin:userDetail.reactivating') : t('admin:userDetail.reactivateAccount')}
                      </button>
                    )}

                    {!confirmDelete ? (
                      <button
                        className={styles.dangerBtn}
                        onClick={() => setConfirmDelete(true)}
                      >
                        {t('admin:userDetail.deleteUser')}
                      </button>
                    ) : (
                      <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: 12 }}>
                        <p style={{ fontSize: 13, marginBottom: 10, color: '#fca5a5' }}>
                          {t('admin:userDetail.deleteWarning')}
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className={styles.dangerBtn}
                            disabled={actionLoading === 'soft_delete'}
                            onClick={() => handleAction('soft_delete')}
                          >
                            {actionLoading === 'soft_delete' ? t('admin:userDetail.deleting') : t('admin:userDetail.confirmDelete')}
                          </button>
                          <button className={styles.secondaryBtn} onClick={() => setConfirmDelete(false)}>{t('common:action.cancel')}</button>
                    </div>
                  </div>
                )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Recent Errors */}
        <div>
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>{t('admin:userDetail.recentErrors')}</div>
            {recentErrors.length === 0 ? (
              <p className={styles.empty}>{t('admin:userDetail.noErrors')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {recentErrors.map(ce => {
                  const isExp = expandedErrorId === ce.id
                  return (
                    <Fragment key={ce.id}>
                      <div
                        onClick={() => setExpandedErrorId(isExp ? null : ce.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', fontSize: 12 }}
                      >
                        <SeverityBadge severity={ce.severity} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ce.error_message}>
                          {ce.error_message?.slice(0, 80)}
                        </span>
                        <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>
                          {timeAgo(ce.created_at, t)}
                        </span>
                      </div>
                      {isExp && (
                        <div style={{ padding: '10px 0 10px 8px', fontSize: 12, borderBottom: '1px solid var(--color-border)' }}>
                          <div style={{ marginBottom: 6 }}><strong>{t('admin:userDetail.messageLabel')}</strong> {ce.error_message}</div>
                          <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--color-text-muted)' }}>
                            <strong>{t('admin:userDetail.pageLabel')}</strong> {ce.page_url}
                          </div>
                          <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--color-text-muted)' }}>
                            <strong>{t('admin:userDetail.fingerprintLabel')}</strong> {ce.error_fingerprint || '-'}
                          </div>
                          {ce.error_stack && (
                            <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 4, maxHeight: 150, overflow: 'auto', marginBottom: 6 }}>
                              {ce.error_stack}
                            </pre>
                          )}
                          {ce.breadcrumbs && ce.breadcrumbs.length > 0 && (
                            <details style={{ fontSize: 11 }}>
                              <summary style={{ cursor: 'pointer', color: 'var(--color-primary)' }}>{t('admin:userDetail.breadcrumbs', { count: ce.breadcrumbs.length })}</summary>
                              <div style={{ maxHeight: 150, overflow: 'auto', marginTop: 4 }}>
                                {ce.breadcrumbs.map((b, i) => (
                                  <div key={i} style={{ padding: '2px 0', color: 'var(--color-text-muted)' }}>
                                    {formatTime(b.timestamp)} [{b.category}] {b.message}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </Fragment>
                  )
                })}
              </div>
            )}
            {currentUserRole && currentUserRole !== 'contractor_user' && (
              <Link
                to={`${currentUserRole === 'super_admin' ? '/admin/errors' : '/dashboard/errors'}?user_id=${userId}`}
                style={{ display: 'block', marginTop: 12, fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none' }}
              >
                {t('admin:userDetail.viewAllErrors')} &rarr;
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1e293b', color: '#e2e8f0', padding: '12px 20px', borderRadius: 8, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {/* Enter account modal */}
      {showEnterAccount && profile?.company_id && (
        <Modal title={t('admin:impersonation.enterAccount')} onClose={() => setShowEnterAccount(false)}>
          <EnterAccountModal
            companyName={companies.find(c => c.id === profile.company_id)?.name || t('admin:userDetail.thisAccount')}
            onCancel={() => setShowEnterAccount(false)}
            onConfirm={async (notes) => {
              await startImpersonation(profile.company_id, { targetUserId: userId, notes })
              setShowEnterAccount(false)
              navigate('/dashboard')
            }}
          />
        </Modal>
      )}
    </div>
  )
}

function ProfileField({ label, value, editable, editField, fieldName, editValue, saving, onStartEdit, onSave, onCancel, onChangeValue, valueStyle }) {
  const { t } = useTranslation()
  const isEditing = editable && editField === fieldName

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>{label}</span>
      {isEditing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            value={editValue}
            onChange={e => onChangeValue(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', width: 160 }}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') onSave(editValue)
              if (e.key === 'Escape') onCancel()
            }}
          />
          <button onClick={() => onSave(editValue)} disabled={saving} style={{ fontSize: 11, padding: '3px 8px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            {saving ? '...' : t('common:action.save')}
          </button>
          <button onClick={onCancel} style={{ fontSize: 11, padding: '3px 6px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            {t('common:action.cancel')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, ...valueStyle }}>{value || '-'}</span>
          {editable && (
            <button
              onClick={() => onStartEdit(value)}
              style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0 2px' }}
            >
              &#9998;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
