import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatAuthError } from '../lib/authErrors'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import LanguageToggle from '../components/LanguageToggle'
import styles from './LoginPage.module.css'

export default function LoginPage() {
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
    if (error) setError(formatAuthError(error))
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

          <h1 className={styles.title}>Reset your password</h1>

          {forgotSent ? (
            <div className={styles.successBox}>
              Sniff your inbox for the reset link.
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleForgot}>
              <div className={styles.field}>
                <label htmlFor="forgot-email">Email address</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {forgotError && <div className={styles.error}>{forgotError}</div>}

              <button type="submit" className={styles.btn} disabled={forgotLoading}>
                {forgotLoading ? 'On the trail...' : 'Send reset link'}
              </button>
            </form>
          )}

          <button className={styles.backLink} onClick={handleBackToLogin}>
            ← Back to sign in
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

        <h1 className={styles.title}>Welcome back to the pack</h1>

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.field}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
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
            {loading ? 'Opening the door...' : 'Sign in'}
          </button>
        </form>

        <button className={styles.forgotBtn} onClick={() => setShowForgot(true)}>
          Forgot password?
        </button>

        <p className={styles.footer}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>Sign up free</Link>
        </p>
      </div>
    </div>
  )
}
