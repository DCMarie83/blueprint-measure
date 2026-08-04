import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND, FOUNDER_SPOTS_SCARCITY_THRESHOLD } from '../lib/config'
import { formatAuthError } from '../lib/authErrors'
import Logo from '../components/brand/Logo'
import LanguageToggle from '../components/LanguageToggle'
import { US_STATES } from '../data/usStates'
import { TRADES, DEFAULT_TRADE } from '../constants/trades'
import { Check, Shield, Lock, Ruler, FileText, Clock, DollarSign, Eye, EyeOff } from 'lucide-react'
import formStyles from './LoginPage.module.css'
import s from './SignupPage.module.css'

const selectStyle = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)', padding: '11px 14px', fontSize: 15,
  color: 'var(--color-text)', outline: 'none', width: '100%', boxSizing: 'border-box',
}

const DEMOS = [
  { id: '3LpU-EHk9OY', labelKey: 'auth:signup.demoMeasure', caption: 'Blueprint takeoff in seconds.' },
  { id: 'gTEhwPVKymg', labelKey: 'auth:signup.demoEstimate', caption: 'Polished estimates from your measurements, fast.' },
  { id: 'qOaL4Mzg6HA', labelKey: 'auth:signup.demoManage', caption: 'Crew hours, tracked to the job.' },
]

const NARRATIVE = [
  { step: '1', titleKey: 'auth:signup.narrative1Title', descKey: 'auth:signup.narrative1Desc', icon: Ruler },
  { step: '2', titleKey: 'auth:signup.narrative2Title', descKey: 'auth:signup.narrative2Desc', icon: FileText },
  { step: '3', titleKey: 'auth:signup.narrative3Title', descKey: 'auth:signup.narrative3Desc', icon: Clock },
  { step: '4', titleKey: 'auth:signup.narrative4Title', descKey: 'auth:signup.narrative4Desc', icon: DollarSign },
]

function DemoCard({ id, label }) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false);
  return (
    <div className={s.demoCard}>
      <span className={s.demoLabel}>{label}</span>
      <div className={s.demoVideo}>
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={label}
          />
        ) : (
          <button
            type="button"
            className={s.demoPoster}
            onClick={() => setPlaying(true)}
            aria-label={t('auth:signup.demoPlayAria', { label })}
          >
            <img
              src={`https://img.youtube.com/vi/${id}/maxresdefault.jpg`}
              onError={(e) => { e.currentTarget.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`; }}
              alt={t('auth:signup.demoAlt', { label })}
              loading="lazy"
            />
            <span className={s.demoPlay} aria-hidden="true">▶</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function SignupPage() {
  const { t } = useTranslation()
  const formRef = useRef(null)

  // ── UTM capture on landing ─────────────────────────────────
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

  // ── State scarcity (NEW) ───────────────────────────────────
  const [heroState, setHeroState] = useState('')
  const [scarcity, setScarcity] = useState(null)
  const [scarcityLoading, setScarcityLoading] = useState(false)

  const canSubmit =
    fullName.trim() && email.trim() &&
    password.length >= 8 && state && termsAccepted

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setDuplicateEmail(false)
    if (!canSubmit) return
    setLoading(true)

    // Exact metadata contract with handle_new_user: nothing else is sent.
    // company_name key is omitted entirely when blank (trigger falls back
    // full_name -> email local part). terms_accepted_at / email_consent are
    // written server-side by the trigger.
    const metadata = {
      signup_path: 'self_serve',
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
      // fake SUCCESS with an empty identities array. Without this check the
      // user waits forever for an email that never sends.
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

  // ── handleResend (UNCHANGED) ───────────────────────────────
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

  // ── Scarcity RPC ───────────────────────────────────────────
  const fetchScarcity = useCallback(async (code) => {
    if (!code) { setScarcity(null); return }
    setScarcityLoading(true)
    try {
      const { data } = await supabase.rpc('get_founder_spots', { p_state: code })
      setScarcity(data && data.length > 0 ? data[0] : null)
    } catch {
      setScarcity(null)
    } finally {
      setScarcityLoading(false)
    }
  }, [])

  function handleHeroStateChange(code) {
    setHeroState(code)
    setState(code) // pre-fill the form's state field
    fetchScarcity(code)
  }

  const stateName = heroState ? US_STATES.find(s => s.code === heroState)?.name || heroState : ''

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Success state (UNCHANGED) ──────────────────────────────
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

  return (
    <div className={s.page}>
      {/* ── 1. TOP BAR ──────────────────────────────────────────── */}
      <div className={s.topBar} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="https://rivetdog.com" style={{ textDecoration: 'none' }}><Logo variant="full" /></a>
        <LanguageToggle />
      </div>

      {/* ── 2. HERO ─────────────────────────────────────────────── */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <h1 className={s.heroH1}>
            {t('auth:signup.heroH1')}
          </h1>
          <p className={s.heroSub}>
            {t('auth:signup.heroSub')}
          </p>

          <div className={s.chips}>
            <span className={s.chip}><Shield size={14} style={{ color: 'var(--color-primary)' }} /> {t('auth:signup.chip14DayTrial')}</span>
            <span className={s.chip}><Check size={14} style={{ color: 'var(--color-primary)' }} /> {t('auth:shared.cancelAnytime')}</span>
            <span className={s.chip}><Lock size={14} style={{ color: 'var(--color-primary)' }} /> {t('auth:signup.chipLockedForLife')}</span>
          </div>

          {/* State scarcity */}
          <div className={s.stateBox}>
            <div className={s.stateLabel}>{t('auth:signup.whereWork')}</div>
            <select
              className={s.stateSelect}
              value={heroState}
              onChange={e => handleHeroStateChange(e.target.value)}
            >
              <option value="">{t('auth:signup.selectYourState')}</option>
              {US_STATES.map(st => <option key={st.code} value={st.code}>{st.name}</option>)}
            </select>

            {scarcityLoading && (
              <p className={s.scarcitySub} style={{ marginTop: 12 }}>{t('auth:signup.checkingAvailability')}</p>
            )}

            {(() => {
              // No state selected, RPC in flight, errored, or returned nothing
              // -> render NOTHING. Silence beats a false promise.
              if (scarcityLoading || !heroState || !scarcity) return null

              const capStatement = (
                <>
                  <p className={s.scarcityLine}>
                    {t('auth:scarcity.capPerState', { count: scarcity.spots_total })}
                  </p>
                  <p className={s.scarcitySub}>
                    {t('auth:scarcity.whenFills', { state: stateName })}
                  </p>
                </>
              )

              // Branch A — plenty left: cap statement, no live count.
              if (scarcity.spots_remaining > FOUNDER_SPOTS_SCARCITY_THRESHOLD) {
                return capStatement
              }

              // Branch B — nearly full: live count.
              if (scarcity.spots_remaining > 0) {
                return (
                  <p className={s.scarcityLine}>
                    {t('auth:scarcity.spotsLeftInState', { count: scarcity.spots_remaining, state: stateName })}
                  </p>
                )
              }

              // Branch C — full: point at the next tier, but never render
              // "Join at $/mo" with holes. Missing next tier -> cap statement.
              if (scarcity.next_tier_name == null || scarcity.next_tier_price == null) {
                return capStatement
              }
              return (
                <>
                  <p className={s.scarcityLine}>
                    {t('auth:scarcity.planFull', { plan: scarcity.plan_name, state: stateName })}
                  </p>
                  <p className={s.scarcitySub}>
                    {t('auth:scarcity.joinNextTier', { tier: scarcity.next_tier_name, price: scarcity.next_tier_price })}
                  </p>
                </>
              )
            })()}
          </div>

        </div>

        {/* ── Form card (RIGHT column) ────────────────────────── */}
        <div className={s.formCard} ref={formRef}>
          <h2 className={s.formTitle}>{t('auth:signup.startTrial')}</h2>

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
              <input id="companyName" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t('auth:signup.companyPlaceholder')} autoComplete="organization" />
            </div>

            <div className={formStyles.nameRow}>
              <div className={formStyles.field}>
                <label htmlFor="state">{t('auth:shared.stateLabel')}</label>
                <select id="state" value={state} onChange={e => handleHeroStateChange(e.target.value)} style={selectStyle} required>
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

          <p className={formStyles.footer}>
            {t('auth:shared.alreadyHaveAccount')}{' '}
            <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>{t('auth:shared.signIn')}</Link>
          </p>
        </div>
      </div>

      {/* ── 3. DEMO VIDEOS (below the fold) ─────────────────────── */}
      <div className={s.strip}>
        <h2 className={s.stripTitle}>{t('auth:signup.seeItWork')}</h2>
        <div className={s.demoGrid}>
          {DEMOS.map(d => (
            <DemoCard key={d.id} id={d.id} label={t(d.labelKey)} />
          ))}
        </div>
      </div>

      {/* ── 4. NARRATIVE STRIP ──────────────────────────────────── */}
      <div className={s.strip}>
        <h2 className={s.stripTitle}>{t('auth:signup.narrativeStripTitle')}</h2>
        <div className={s.narrativeGrid}>
          {NARRATIVE.map(n => (
            <div key={n.step} className={s.narrativeCard}>
              <div className={s.narrativeStep}>{t('auth:shared.stepLabel', { step: n.step })}</div>
              <n.icon size={28} style={{ color: 'var(--color-primary)', marginBottom: 8 }} />
              <div className={s.narrativeLabel}>{t(n.titleKey)}</div>
              <div className={s.narrativeDesc}>{t(n.descKey)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. TESTIMONIALS ─────────────────────────────────────── */}
      <div className={s.strip} style={{ borderTop: '1px solid var(--color-border)' }}>
        <h2 className={s.stripTitle}>{t('auth:signup.testimonialsTitle')}</h2>
        <div className={s.testimonialGrid}>
          <div className={s.testimonialCard}>
            <p className={s.testimonialQuote}>
              {t('auth:signup.testimonial1Quote')}
            </p>
            <p className={s.testimonialAttrib}>{t('auth:signup.testimonial1Attrib')}</p>
          </div>
          <div className={s.testimonialCard}>
            <p className={s.testimonialQuote}>
              {t('auth:signup.testimonial2Quote')}
            </p>
            <p className={s.testimonialAttrib}>{t('auth:signup.testimonial2Attrib')}</p>
          </div>
        </div>
      </div>

      {/* ── 6. OFFER FAQ ────────────────────────────────────────── */}
      <div className={s.strip}>
        <h2 className={s.stripTitle}>{t('auth:signup.faqTitle')}</h2>
        <div className={s.faqList}>
          <div className={s.faqItem}>
            <p className={s.faqQ}>{t('auth:signup.faq1Q')}</p>
            <p className={s.faqA}>
              {t('auth:signup.faq1A')}
            </p>
          </div>
          <div className={s.faqItem}>
            <p className={s.faqQ}>{t('auth:signup.faq2Q')}</p>
            <p className={s.faqA}>
              {t('auth:signup.faq2A')}
            </p>
          </div>
        </div>
      </div>

      {/* ── 7. FINAL CTA ────────────────────────────────────────── */}
      <div className={s.finalCta}>
        <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)', marginBottom: 8 }}>
          {t('auth:signup.finalPrice')}
        </p>
        <p style={{ fontSize: 15, color: 'var(--color-text-muted)', marginBottom: 24 }}>
          {t('auth:signup.finalSub')}
        </p>
        <button className={s.ctaButton} onClick={scrollToForm}>
          {t('auth:signup.finalCta')}
        </button>
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
