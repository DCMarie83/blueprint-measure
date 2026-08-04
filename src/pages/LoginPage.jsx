import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatAuthError } from '../lib/authErrors'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import LanguageToggle from '../components/LanguageToggle'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { t } = useTranslation()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // ── Forgot password state ─────────────────────────────────────────────────
  const [showForgot,    setShowForgot]    = useState(false)
  const [forgotEmail,   setForgotEmail]   = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent,    setForgotSent]    = useState(false)
  const [forgotError,   setForgotError]   = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(formatAuthError(error, t))
    // On success, AuthContext updates automatically and App.jsx redirects to /dashboard
    setLoading(false)
  }

  async function handleForgot(e) {
    e.preventDefault()
    setForgotError('')
    setForgotLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/change-password`,
    })
    if (error) {
      setForgotError(error.message)
    } else {
      setForgotSent(true)
    }
    setForgotLoading(false)
  }

  function handleBackToLogin() {
    setShowForgot(false)
    setForgotEmail('')
    setForgotSent(false)
    setForgotError('')
  }

  // ── Forgot password view ──────────────────────────────────────────────────
  if (showForgot) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <Logo variant="full" />
          </div>

          <h1 className={styles.title}>{t('auth:login.resetTitle')}</h1>

          {forgotSent ? (
            <div className={styles.successBox}>
              {t('auth:login.forgotSent')}
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleForgot}>
              <div className={styles.field}>
                <label htmlFor="forgot-email">{t('auth:shared.emailLabel')}</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder={t('auth:shared.emailPlaceholder')}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {forgotError && <div className={styles.error}>{forgotError}</div>}

              <button type="submit" className={styles.btn} disabled={forgotLoading}>
                {forgotLoading ? t('auth:login.sendingReset') : t('auth:login.sendReset')}
              </button>
            </form>
          )}

          <button className={styles.backLink} onClick={handleBackToLogin}>
            {t('auth:shared.backToSignIn')}
          </button>
        </div>
      </div>
    )
  }

  // ── Normal login view ─────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageToggle />
        </div>
        <div className={styles.logo}>
          <Logo variant="full" />
        </div>

        <h1 className={styles.title}>{t('auth:login.title')}</h1>

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.field}>
            <label htmlFor="email">{t('auth:shared.emailLabel')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('auth:shared.emailPlaceholder')}
              required
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">{t('auth:shared.passwordLabel')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? t('auth:login.signingIn') : t('auth:login.signIn')}
          </button>
        </form>

        <button className={styles.forgotBtn} onClick={() => setShowForgot(true)}>
          {t('auth:login.forgotPassword')}
        </button>

        <p className={styles.footer}>
          {t('auth:login.noAccount')}{' '}
          <Link to="/signup" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>{t('auth:login.signUpFree')}</Link>
        </p>
      </div>
    </div>
  )
}
