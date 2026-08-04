import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import LanguageToggle from '../components/LanguageToggle'
import styles from './LoginPage.module.css'

export default function ChangePasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('error') || ''
  })
  const [loading,         setLoading]         = useState(false)
  const [headingText, setHeadingText] = useState(t('auth:changePassword.title'))
  const [helperText, setHelperText] = useState(t('auth:changePassword.helper'))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && !user.user_metadata?.force_password_change) {
        setHeadingText(t('auth:changePassword.resetTitle'))
        setHelperText(t('auth:changePassword.resetHelper'))
      }
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError(t('auth:changePassword.errShort'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth:changePassword.errMismatch'))
      return
    }

    setLoading(true)
    try {
      // 1. Update the password
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) throw updateErr

      // 2. Clear the force_password_change flag
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { force_password_change: false },
      })
      if (metaErr) throw metaErr

      // 3. Clear recovery flag and send them to the dashboard
      sessionStorage.removeItem('bpm_password_recovery_pending')
      navigate('/jobs', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageToggle />
        </div>
        <div className={styles.logo}>
          <Logo variant="full" />
        </div>

        <h1 className={styles.title}>{headingText}</h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
          {helperText}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label>{t('auth:changePassword.newPasswordLabel')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder={t('auth:changePassword.newPasswordPlaceholder')}
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label>{t('auth:changePassword.confirmLabel')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('auth:changePassword.confirmPlaceholder')}
              required
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: 'var(--color-danger, #dc2626)', margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '11px',
              background: 'var(--color-primary, #2563eb)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontWeight: 600,
              fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? t('auth:changePassword.saving') : t('auth:changePassword.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
