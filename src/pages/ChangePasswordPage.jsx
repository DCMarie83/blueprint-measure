import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import styles from './LoginPage.module.css'

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('error') || ''
  })
  const [loading,         setLoading]         = useState(false)
  const [headingText, setHeadingText] = useState('Change your password')
  const [helperText, setHelperText] = useState('Your account requires a new password before you can continue. Choose something only you know.')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && !user.user_metadata?.force_password_change) {
        setHeadingText('Reset your password')
        setHelperText('Enter a new password for your account.')
      }
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
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
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <Logo variant="full" />
        </div>

        <h1 className={styles.title}>{headingText}</h1>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
          {helperText}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
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
            {loading ? 'Saving…' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
