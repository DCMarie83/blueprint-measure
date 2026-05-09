import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import styles from './RegisterPage.module.css'

const PW_RULES = [
  { test: v => v.length >= 8, label: 'At least 8 characters' },
  { test: v => /[A-Z]/.test(v), label: 'At least 1 uppercase letter' },
  { test: v => /[0-9]/.test(v), label: 'At least 1 number' },
  { test: v => /[!@#$%^&*]/.test(v), label: 'At least 1 special character (!@#$%^&*)' },
]

export default function RegisterPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? '')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailConsent, setEmailConsent] = useState(false)
  const [smsConsent, setSmsConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({})

  const pwErrors = PW_RULES.filter(r => !r.test(password))
  const phoneValid = phone ? isValidPhoneNumber(phone) : false
  const passwordsMatch = password === confirmPassword
  const canSubmit = fullName.trim() && phoneValid && pwErrors.length === 0 && passwordsMatch && confirmPassword

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!canSubmit) return
    setSubmitting(true)
    try {
      console.log('[register] submit started, user:', user)
      console.log('[register] user.id:', user?.id)

      console.log('[register] calling auth.updateUser')
      const { error: authErr } = await supabase.auth.updateUser({
        password,
        data: { force_password_change: false },
      })
      console.log('[register] auth.updateUser returned, authErr:', authErr)
      if (authErr) throw new Error(authErr.message)

      console.log('[register] starting profile update with user.id:', user?.id)
      const { error: profileErr, data: profileData } = await supabase
        .from('user_profiles')
        .update({
          full_name: fullName.trim(),
          phone,
          phone_country: 'US',
          email_consent: emailConsent,
          sms_consent: smsConsent,
          sms_consent_at: smsConsent ? new Date().toISOString() : null,
          setup_completed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
      console.log('[register] profile update returned, profileErr:', profileErr, 'data:', profileData)
      if (profileErr) throw new Error(profileErr.message)

      console.log('[register] redirecting to /dashboard')
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('[register] caught error:', err)
      setError(err.message)
    } finally {
      console.log('[register] submit handler finally block')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}><Logo variant="full" /></div>
        <h1 className={styles.title}>Welcome! Let's set up your account.</h1>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label>Full Name *</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, name: true }))}
              placeholder="Your full name"
              required
              autoFocus
            />
            {touched.name && !fullName.trim() && <span className={styles.fieldError}>Name is required</span>}
          </div>

          <div className={styles.field}>
            <label>Email</label>
            <input type="email" value={user?.email ?? ''} disabled className={styles.disabledInput} />
          </div>

          <div className={styles.field}>
            <label>Phone *</label>
            <PhoneInput
              international
              defaultCountry="US"
              value={phone}
              onChange={setPhone}
              className={styles.phoneInput}
            />
            {touched.phone && phone && !phoneValid && <span className={styles.fieldError}>Enter a valid phone number</span>}
            {touched.phone && !phone && <span className={styles.fieldError}>Phone is required</span>}
          </div>

          <div className={styles.field}>
            <label>Password *</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, password: true }))}
              placeholder="At least 8 characters"
              required
            />
            {touched.password && password && pwErrors.length > 0 && (
              <div className={styles.pwRules}>
                {PW_RULES.map(r => (
                  <div key={r.label} className={r.test(password) ? styles.pwRulePass : styles.pwRuleFail}>
                    {r.test(password) ? '✓' : '✕'} {r.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label>Confirm Password *</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, confirm: true }))}
              placeholder="Repeat password"
              required
            />
            {touched.confirm && confirmPassword && !passwordsMatch && (
              <span className={styles.fieldError}>Passwords do not match</span>
            )}
          </div>

          <div className={styles.consentGroup}>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={emailConsent} onChange={e => setEmailConsent(e.target.checked)} />
              <span>I agree to receive product updates and account-related emails from {BRAND.name}</span>
            </label>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={smsConsent} onChange={e => setSmsConsent(e.target.checked)} />
              <span>I agree to receive text messages about my account from {BRAND.name}</span>
            </label>
          </div>

          <button type="submit" className={styles.submitBtn} disabled={!canSubmit || submitting}>
            {submitting ? 'Setting up…' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  )
}
