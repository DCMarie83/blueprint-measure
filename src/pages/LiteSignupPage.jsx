import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND, FOUNDER_SPOTS_SCARCITY_THRESHOLD } from '../lib/config'
import { formatAuthError } from '../lib/authErrors'
import Logo from '../components/brand/Logo'
import LanguageToggle from '../components/LanguageToggle'
import { US_STATES } from '../data/usStates'
import { TRADES, DEFAULT_TRADE } from '../constants/trades'
import { Check, Shield, Clock, FileText, DollarSign, Eye, EyeOff } from 'lucide-react'
import formStyles from './LoginPage.module.css'
import s from './SignupPage.module.css'

const selectStyle = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)', padding: '11px 14px', fontSize: 15,
  color: 'var(--color-text)', outline: 'none', width: '100%', boxSizing: 'border-box',
}

const STEPS = [
  { step: '1', title: 'Log the Day', desc: 'Hours, materials, notes — logged from your phone before you leave the site.', icon: Clock },
  { step: '2', title: 'Build the Invoice', desc: 'Your work log becomes a clean, itemized invoice in one tap.', icon: FileText },
  { step: '3', title: 'Get Paid', desc: 'Send it to the GC or homeowner and get paid without chasing paper.', icon: DollarSign },
]

// Format a numeric monthly price without inventing a literal — always sourced
// from the RPC row, never a hardcoded number.
function formatPrice(n) {
  return `$${Number(n).toFixed(2)}`
}

export default function LiteSignupPage() {
  // ── UTM capture on landing (same stash SignupPage uses) ────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const utms = {}
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const val = params.get(key)
      if (val) utms[key] = val
    }
    if (Object.keys(utms).length > 0) {
      localStorage.setItem('rivetdog_utms', JSON.stringify(utms))
    }
  }, [])

  const navigate = useNavigate()

  // ── Offer (server-driven — never hardcode price/trial/plan_key) ────
  const [offer, setOffer] = useState(null)
  const [offerLoading, setOfferLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('get_lite_offer')
        if (error) throw error
        // RPC may return a single composite or a one-row table.
        const row = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
        if (!cancelled) setOffer(row)
      } catch {
        // Fail closed: a null offer renders the "not open" state, never a
        // hardcoded plan/price fallback.
        if (!cancelled) setOffer(null)
      } finally {
        if (!cancelled) setOfferLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Account state ──────────────────────────────────────────
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

  // ── Business state ─────────────────────────────────────────
  const [companyName, setCompanyName] = useState('')
  const [tradeVertical, setTradeVertical] = useState(DEFAULT_TRADE)
  const [state, setState] = useState('')

  // ── UI state ───────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [duplicateEmail, setDuplicateEmail] = useState(false)
  const [sent, setSent] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  const canSubmit =
    fullName.trim() && email.trim() &&
    password.length >= 8 && state && termsAccepted

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setDuplicateEmail(false)
    if (!canSubmit) return
    // The form only renders when the offer is available, but guard anyway:
    // the plan_key we send back is the one the SERVER handed us, never a
    // hardcoded string. This is the /signup price-drift bug prevented — the
    // page promises exactly what the trigger will deliver.
    if (!offer?.plan_key) return
    setLoading(true)

    const metadata = {
      signup_path: 'self_serve',
      plan_key: offer.plan_key,
      full_name: fullName.trim(),
      trade_vertical: tradeVertical,
      state,
    }
    if (companyName.trim()) metadata.company_name = companyName.trim()

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: metadata,
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })

    if (signUpError) {
      const msg = signUpError.message?.toLowerCase() || ''
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setDuplicateEmail(true)
      } else {
        setError(formatAuthError(signUpError))
      }
    } else if (data?.user && data.user.identities?.length === 0) {
      // Confirmations ON: Supabase obfuscates an existing confirmed email as a
      // fake SUCCESS with an empty identities array.
      setDuplicateEmail(true)
    } else if (data?.session) {
      // Confirmations OFF: signed in immediately — straight to checkout.
      navigate('/subscribe')
      return
    } else {
      // Confirmations ON, genuinely new account: keep the email screen.
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

  // ── Check-email fallback ───────────────────────────────────
  if (sent) {
    return (
      <div className={formStyles.page}>
        <div className={formStyles.card}>
          <div className={formStyles.logo}><Logo variant="full" /></div>
          <h1 className={formStyles.title}>Check your email</h1>
          <div className={formStyles.successBox}>
            We sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account, then you'll add a card to start your free trial.
          </div>
          <button className={formStyles.btn} style={{ marginTop: 16 }} onClick={handleResend} disabled={resending}>
            {resending ? 'Resending…' : 'Resend confirmation email'}
          </button>
          {resendMsg && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10, textAlign: 'center' }}>{resendMsg}</p>}
          <Link to="/login" className={formStyles.backLink} style={{ display: 'block', marginTop: 18 }}>← Back to sign in</Link>
        </div>
      </div>
    )
  }

  // ── Loading: never flash a price placeholder ───────────────
  if (offerLoading) {
    return (
      <div className={s.page}>
        <div className={s.topBar}>
          <a href="https://rivetdog.com" style={{ textDecoration: 'none' }}><Logo variant="full" /></a>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 24px' }}>
          <div className="spinner" />
        </div>
      </div>
    )
  }

  // ── Offer closed / unavailable: hide the form, plain message ───
  if (!offer || offer.available === false) {
    return (
      <div className={s.page}>
        <div className={s.topBar}>
          <a href="https://rivetdog.com" style={{ textDecoration: 'none' }}><Logo variant="full" /></a>
        </div>
        <div className={formStyles.page}>
          <div className={formStyles.card}>
            <div className={formStyles.logo}><Logo variant="full" /></div>
            <h1 className={formStyles.title}>Signups are closed right now</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, textAlign: 'center' }}>
              This plan isn't currently open for new signups. Check back soon.
            </p>
            <Link to="/login" className={formStyles.backLink} style={{ display: 'block', marginTop: 18 }}>← Back to sign in</Link>
          </div>
        </div>
      </div>
    )
  }

  // Everything below renders from the RPC row — no price/trial literals.
  const planName = offer.display_name
  const priceLabel = formatPrice(offer.monthly_price)
  const trialDays = offer.trial_days
  const spots = offer.spots_remaining
  // Threshold is offer-driven; fall back to the shared config only when the
  // RPC leaves it null.
  const scarcityThreshold = offer.scarcity_threshold ?? FOUNDER_SPOTS_SCARCITY_THRESHOLD

  return (
    <div className={s.page}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px 0' }}>
        <LanguageToggle />
      </div>
      {/* ── Title block — long-form logo + product name + offer, centered
           on mobile and desktop. Name and offer are RPC-driven, never
           literals. ─────────────────────────────────────────────────── */}
      <div className={s.titleBlock}>
        <a href="https://rivetdog.com" style={{ textDecoration: 'none', display: 'inline-block' }}>
          <Logo variant="full" className={s.titleLogo} />
        </a>
        <div className={s.titleName}>{planName}</div>
        <div className={s.titleOffer}>{priceLabel}/mo · {trialDays}-day free trial</div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <h1 className={s.heroH1}>
            Log your day. Send the invoice. Get paid.
          </h1>
          <p className={s.heroSub}>
            {planName} is the daily work log for subcontractors that turns into an invoice. Track your hours and materials on the job, then bill for them the same day — {priceLabel}/mo.
          </p>

          <div className={s.chips}>
            <span className={s.chip}><Shield size={14} style={{ color: 'var(--color-primary)' }} /> {trialDays}-day free trial</span>
            <span className={s.chip}><Check size={14} style={{ color: 'var(--color-primary)' }} /> Cancel anytime</span>
          </div>

          {/* Scarcity — mirrors /signup's threshold rule against the live count */}
          {spots != null && (
            spots <= scarcityThreshold ? (
              <p className={s.scarcityLine}>
                Only {spots} founder {spots === 1 ? 'spot' : 'spots'} left at this price.
              </p>
            ) : (
              <p className={s.scarcitySub}>
                Only {offer.cohort_cap} founder spots at this price.
              </p>
            )
          )}

          <div className={s.narrativeGrid} style={{ gridTemplateColumns: '1fr' }}>
            {STEPS.map(n => (
              <div key={n.step} className={s.narrativeCard} style={{ padding: '16px 20px' }}>
                <div className={s.narrativeStep}>Step {n.step}</div>
                <n.icon size={24} style={{ color: 'var(--color-primary)', marginBottom: 4 }} />
                <div className={s.narrativeLabel}>{n.title}</div>
                <div className={s.narrativeDesc}>{n.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Form card ─────────────────────────────────────────── */}
        <div className={s.formCard}>
          <h2 className={s.formTitle}>Start your {trialDays}-day free trial</h2>

          <form className={formStyles.form} onSubmit={handleSubmit}>
            <div className={formStyles.field}>
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" required autoComplete="name" />
            </div>

            <div className={formStyles.field}>
              <label htmlFor="signupEmail">Email address</label>
              <input id="signupEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" />
            </div>

            <div className={formStyles.field}>
              <label htmlFor="signupPassword">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="signupPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{ width: '100%', boxSizing: 'border-box', paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className={formStyles.field}>
              <label htmlFor="companyName">Company name <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
              <input id="companyName" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Working under your own name? Leave this blank." autoComplete="organization" />
            </div>

            <div className={formStyles.nameRow}>
              <div className={formStyles.field}>
                <label htmlFor="state">State</label>
                <select id="state" value={state} onChange={e => setState(e.target.value)} style={selectStyle} required>
                  <option value="">Select state</option>
                  {US_STATES.map(st => <option key={st.code} value={st.code}>{st.code}</option>)}
                </select>
              </div>
              <div className={formStyles.field}>
                <label htmlFor="tradeVertical">Trade</label>
                <select id="tradeVertical" value={tradeVertical} onChange={e => setTradeVertical(e.target.value)} style={selectStyle}>
                  {TRADES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Terms */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a>.
              </span>
            </label>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0', paddingLeft: 24 }}>
              We'll email you product updates and setup tips. Unsubscribe anytime.
            </p>

            {error && <div className={formStyles.error}>{error}</div>}
            {duplicateEmail && (
              <div className={formStyles.error}>
                An account with this email already exists. Try{' '}
                <Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>logging in</Link>
                {' '}or resetting your password.
              </div>
            )}

            <button type="submit" className={formStyles.btn} disabled={!canSubmit || loading}>
              {loading ? 'Creating account…' : 'Start free trial'}
            </button>
          </form>

          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', margin: '14px 0 0' }}>
            {priceLabel}/mo after your {trialDays}-day free trial. Cancel anytime.
          </p>

          <p className={formStyles.footer}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>
      </div>

      {/* ── Legal ───────────────────────────────────────────────── */}
      <div className={s.legalFooter}>
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
        {' · '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
        {' · '}
        © {new Date().getFullYear()} {BRAND.legalEntity}
      </div>
    </div>
  )
}
