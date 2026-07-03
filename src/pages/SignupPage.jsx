import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import { US_STATES } from '../data/usStates'
import { TRADES, DEFAULT_TRADE } from '../constants/trades'
import styles from './LoginPage.module.css'

const selectStyle = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)', padding: '11px 14px', fontSize: 15,
  color: 'var(--color-text)', outline: 'none', width: '100%', boxSizing: 'border-box',
}

export default function SignupPage() {
  // Account
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)

  // Business
  const [companyName, setCompanyName] = useState('')
  const [tradeVertical, setTradeVertical] = useState(DEFAULT_TRADE)
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [brandingChoice, setBrandingChoice] = useState('later')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  const passwordsMatch = password === confirmPassword
  const canSubmit =
    firstName.trim() && lastName.trim() && email.trim() &&
    password.length >= 8 && passwordsMatch && confirmPassword &&
    companyName.trim() && termsAccepted &&
    addressLine1.trim() && city.trim() && state && zip.trim() && businessPhone.trim()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!canSubmit) return
    setLoading(true)

    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          signup_path: 'self_serve',
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          company_name: companyName.trim(),
          trade_vertical: tradeVertical,
          address_line1: addressLine1.trim(),
          address_line2: addressLine2.trim(),
          city: city.trim(),
          state,
          zip: zip.trim(),
          business_phone: businessPhone.trim(),
          wants_branding_quote: brandingChoice === 'quote',
          terms_accepted_at: new Date().toISOString(),
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })

    if (signUpError) {
      const msg = signUpError.message?.toLowerCase() || ''
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('An account with this email already exists. Try logging in or resetting your password.')
      } else {
        setError(signUpError.message)
      }
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function handleResend() {
    setResending(true)
    setResendMsg('')
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    if (error) {
      setResendMsg('Failed to resend. Try again in a moment.')
    } else {
      setResendMsg('Confirmation email resent.')
    }
    setResending(false)
  }

  if (sent) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}><Logo variant="full" /></div>
          <h1 className={styles.title}>Check your email</h1>
          <div className={styles.successBox}>
            We sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account.
          </div>
          <button className={styles.btn} style={{ marginTop: 16 }} onClick={handleResend} disabled={resending}>
            {resending ? 'Resending…' : 'Resend confirmation email'}
          </button>
          {resendMsg && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10, textAlign: 'center' }}>{resendMsg}</p>}
          <Link to="/login" className={styles.backLink} style={{ display: 'block', marginTop: 18 }}>← Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card} style={{ maxWidth: 520 }}>
        <div className={styles.logo}><Logo variant="full" /></div>
        <h1 className={styles.title}>Create your account</h1>

        <form className={styles.form} onSubmit={handleSubmit}>

          {/* ── Your Account ──────────────────────────────────────── */}
          <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 8 }}>Your Account</div>

          <div className={styles.nameRow}>
            <div className={styles.field}>
              <label htmlFor="firstName">First name</label>
              <input id="firstName" type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" required autoComplete="given-name" autoFocus />
            </div>
            <div className={styles.field}>
              <label htmlFor="lastName">Last name</label>
              <input id="lastName" type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" required autoComplete="family-name" />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="signupEmail">Email address</label>
            <input id="signupEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" />
          </div>

          <div className={styles.field}>
            <label htmlFor="signupPassword">Password</label>
            <input id="signupPassword" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" required autoComplete="new-password" />
            {confirmPassword && !passwordsMatch && <div className={styles.error}>Passwords don't match</div>}
          </div>

          {/* ── Your Business ─────────────────────────────────────── */}
          <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginTop: 20, marginBottom: 8, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>Your Business</div>

          <div className={styles.nameRow}>
            <div className={styles.field}>
              <label htmlFor="companyName">Company name</label>
              <input id="companyName" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Smith Painting LLC" required autoComplete="organization" />
            </div>
            <div className={styles.field}>
              <label htmlFor="tradeVertical">Trade</label>
              <select id="tradeVertical" value={tradeVertical} onChange={e => setTradeVertical(e.target.value)} style={selectStyle}>
                {TRADES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="addressLine1">Street address</label>
            <input id="addressLine1" type="text" value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="123 Main St" required autoComplete="address-line1" />
          </div>

          <div className={styles.field}>
            <label htmlFor="addressLine2">Suite / Unit <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
            <input id="addressLine2" type="text" value={addressLine2} onChange={e => setAddressLine2(e.target.value)} placeholder="Suite 200" autoComplete="address-line2" />
          </div>

          <div className={styles.nameRow} style={{ gap: 10 }}>
            <div className={styles.field} style={{ flex: 2 }}>
              <label htmlFor="city">City</label>
              <input id="city" type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Columbus" required autoComplete="address-level2" />
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
              <label htmlFor="state">State</label>
              <select id="state" value={state} onChange={e => setState(e.target.value)} style={selectStyle} required>
                <option value="">—</option>
                {US_STATES.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
              </select>
            </div>
            <div className={styles.field} style={{ flex: 0, minWidth: 90 }}>
              <label htmlFor="zip">Zip</label>
              <input id="zip" type="text" value={zip} onChange={e => setZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} placeholder="43215" required inputMode="numeric" maxLength={5} autoComplete="postal-code" />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="businessPhone">Business phone</label>
            <input id="businessPhone" type="tel" value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="(614) 555-0100" required autoComplete="tel" />
          </div>

          {/* Branding */}
          <div style={{ margin: '16px 0', padding: 14, background: 'var(--color-surface-2)', borderRadius: 'var(--radius)', fontSize: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Your company logo</div>
            {[
              { value: 'have', label: 'I have a logo' },
              { value: 'quote', label: 'I\'d like a free branding quote from NG Automation Hub' },
              { value: 'later', label: 'I\'ll add it later' },
            ].map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
                <input type="radio" name="brandingChoice" value={opt.value} checked={brandingChoice === opt.value} onChange={() => setBrandingChoice(opt.value)} />
                <span style={{ fontSize: 13 }}>{opt.label}</span>
              </label>
            ))}
          </div>

          {/* Terms */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a>
            </span>
          </label>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.btn} disabled={!canSubmit || loading}>
            {loading ? 'Creating account…' : 'Start free trial'}
          </button>
        </form>

        <p className={styles.footer}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
