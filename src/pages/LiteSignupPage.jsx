import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  { step: '1', titleKey: 'auth:lite.step1Title', descKey: 'auth:lite.step1Desc', icon: Clock },
  { step: '2', titleKey: 'auth:lite.step2Title', descKey: 'auth:lite.step2Desc', icon: FileText },
  { step: '3', titleKey: 'auth:lite.step3Title', descKey: 'auth:lite.step3Desc', icon: DollarSign },
]

// Format a numeric monthly price without inventing a literal — always sourced
// from the RPC row, never a hardcoded number.
function formatPrice(n) {
  return `$${Number(n).toFixed(2)}`
}

export default function LiteSignupPage() {
  const { t } = useTranslation()
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
        setError(formatAuthError(signUpError, t))
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
      setResendMsg(t('auth:shared.resendFailed'))
    } else {
      setResendMsg(t('auth:shared.resendOk'))
    }
    setResending(false)
  }

  // ── Check-email fallback ───────────────────────────────────
  if (sent) {
    return (
      <div className={formStyles.page}>
        <div className={formStyles.card}>
          <div className={formStyles.logo}><Logo variant="full" /></div>
          <h1 className={formStyles.title}>{t('auth:shared.checkEmailTitle')}</h1>
          <div className={formStyles.successBox}>
            {t('auth:shared.confirmationBefore')} <strong>{email}</strong>{t('auth:shared.confirmationAfter')}
          </div>
          <button className={formStyles.btn} style={{ marginTop: 16 }} onClick={handleResend} disabled={resending}>
            {resending ? t('auth:shared.resending') : t('auth:shared.resendConfirmation')}
          </button>
          {resendMsg && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10, textAlign: 'center' }}>{resendMsg}</p>}
          <Link to="/login" className={formStyles.backLink} style={{ display: 'block', marginTop: 18 }}>{t('auth:shared.backToSignIn')}</Link>
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
            <h1 className={formStyles.title}>{t('auth:lite.closedTitle')}</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, textAlign: 'center' }}>
              {t('auth:lite.closedBody')}
            </p>
            <Link to="/login" className={formStyles.backLink} style={{ display: 'block', marginTop: 18 }}>{t('auth:shared.backToSignIn')}</Link>
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
        <div className={s.titleOffer}>{t('auth:lite.titleOffer', { price: priceLabel, days: trialDays })}</div>
      </div>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <h1 className={s.heroH1}>
            {t('auth:lite.heroH1')}
          </h1>
          <p className={s.heroSub}>
            {t('auth:lite.heroSub', { plan: planName, price: priceLabel })}
          </p>

          <div className={s.chips}>
            <span className={s.chip}><Shield size={14} style={{ color: 'var(--color-primary)' }} /> {t('auth:lite.chipTrial', { days: trialDays })}</span>
            <span className={s.chip}><Check size={14} style={{ color: 'var(--color-primary)' }} /> {t('auth:shared.cancelAnytime')}</span>
          </div>

          {/* Scarcity — mirrors /signup's threshold rule against the live count */}
          {spots != null && (
            spots <= scarcityThreshold ? (
              <p className={s.scarcityLine}>
                {t('auth:scarcity.spotsLeftAtPrice', { count: spots })}
              </p>
            ) : (
              <p className={s.scarcitySub}>
                {t('auth:scarcity.capAtPrice', { count: offer.cohort_cap })}
              </p>
            )
          )}

          <div className={s.narrativeGrid} style={{ gridTemplateColumns: '1fr' }}>
            {STEPS.map(n => (
              <div key={n.step} className={s.narrativeCard} style={{ padding: '16px 20px' }}>
                <div className={s.narrativeStep}>{t('auth:shared.stepLabel', { step: n.step })}</div>
                <n.icon size={24} style={{ color: 'var(--color-primary)', marginBottom: 4 }} />
                <div className={s.narrativeLabel}>{t(n.titleKey)}</div>
                <div className={s.narrativeDesc}>{t(n.descKey)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Form card ─────────────────────────────────────────── */}
        <div className={s.formCard}>
          <h2 className={s.formTitle}>{t('auth:lite.formTitleTrial', { days: trialDays })}</h2>

          <form className={formStyles.form} onSubmit={handleSubmit}>
            <div className={formStyles.field}>
              <label htmlFor="fullName">{t('auth:shared.fullNameLabel')}</label>
              <input id="fullName" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('auth:shared.fullNamePlaceholder')} required autoComplete="name" />
            </div>

            <div className={formStyles.field}>
              <label htmlFor="signupEmail">{t('auth:shared.emailLabel')}</label>
              <input id="signupEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth:shared.emailPlaceholder')} required autoComplete="email" />
            </div>

            <div className={formStyles.field}>
              <label htmlFor="signupPassword">{t('auth:shared.passwordLabel')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="signupPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth:shared.passwordPlaceholder')}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{ width: '100%', boxSizing: 'border-box', paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? t('auth:shared.hidePassword') : t('auth:shared.showPassword')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className={formStyles.field}>
              <label htmlFor="companyName">{t('auth:shared.companyNameLabel')} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>{t('auth:shared.optional')}</span></label>
              <input id="companyName" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t('auth:lite.companyPlaceholder')} autoComplete="organization" />
            </div>

            <div className={formStyles.nameRow}>
              <div className={formStyles.field}>
                <label htmlFor="state">{t('auth:shared.stateLabel')}</label>
                <select id="state" value={state} onChange={e => setState(e.target.value)} style={selectStyle} required>
                  <option value="">{t('auth:shared.selectState')}</option>
                  {US_STATES.map(st => <option key={st.code} value={st.code}>{st.code}</option>)}
                </select>
              </div>
              <div className={formStyles.field}>
                <label htmlFor="tradeVertical">{t('auth:shared.tradeLabel')}</label>
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
                {t('auth:shared.termsPrefix')}{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>{t('auth:shared.termsOfService')}</a>
                {' '}{t('auth:shared.and')}{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>{t('auth:shared.privacyPolicy')}</a>.
              </span>
            </label>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 0', paddingLeft: 24 }}>
              {t('auth:shared.emailOptIn')}
            </p>

            {error && <div className={formStyles.error}>{error}</div>}
            {duplicateEmail && (
              <div className={formStyles.error}>
                {t('auth:shared.dupEmailBefore')}{' '}
                <Link to="/login" style={{ color: 'inherit', fontWeight: 600 }}>{t('auth:shared.dupEmailLink')}</Link>
                {' '}{t('auth:shared.dupEmailAfter')}
              </div>
            )}

            <button type="submit" className={formStyles.btn} disabled={!canSubmit || loading}>
              {loading ? t('auth:shared.creatingAccount') : t('auth:shared.startFreeTrial')}
            </button>
          </form>

          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', margin: '14px 0 0' }}>
            {t('auth:lite.priceAfterTrial', { price: priceLabel, days: trialDays })}
          </p>

          <p className={formStyles.footer}>
            {t('auth:shared.alreadyHaveAccount')}{' '}
            <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>{t('auth:shared.signIn')}</Link>
          </p>
        </div>
      </div>

      {/* ── Legal ───────────────────────────────────────────────── */}
      <div className={s.legalFooter}>
        <a href="/terms" target="_blank" rel="noopener noreferrer">{t('auth:shared.legalTerms')}</a>
        {' · '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">{t('auth:shared.legalPrivacy')}</a>
        {' · '}
        © {new Date().getFullYear()} {BRAND.legalEntity}
      </div>
    </div>
  )
}
