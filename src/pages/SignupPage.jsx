import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND, FOUNDER_SPOTS_SCARCITY_THRESHOLD } from '../lib/config'
import { formatAuthError } from '../lib/authErrors'
import Logo from '../components/brand/Logo'
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
  { id: '3LpU-EHk9OY', label: 'Measure', caption: 'Blueprint takeoff in seconds.' },
  { id: 'gTEhwPVKymg', label: 'Estimate', caption: 'Polished estimates from your measurements, fast.' },
  { id: 'qOaL4Mzg6HA', label: 'Manage', caption: 'Crew hours, tracked to the job.' },
]

const NARRATIVE = [
  { step: '1', title: 'Start the Bid', desc: 'Upload a blueprint, set scale, measure every zone in minutes.', icon: Ruler },
  { step: '2', title: 'Win the Bid', desc: 'Send a polished estimate your client accepts right from their portal.', icon: FileText },
  { step: '3', title: 'Perform the Job', desc: 'Track crew time, materials, and expenses against the bid — live.', icon: Clock },
  { step: '4', title: 'Get Paid', desc: 'Invoice from the accepted estimate. Clients pay through their portal.', icon: DollarSign },
]

function DemoCard({ id, label }) {
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
            aria-label={`Play ${label} demo`}
          >
            <img
              src={`https://img.youtube.com/vi/${id}/maxresdefault.jpg`}
              onError={(e) => { e.currentTarget.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`; }}
              alt={`${label} demo`}
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
        setError(formatAuthError(signUpError))
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
      setResendMsg('Failed to resend. Try again in a moment.')
    } else {
      setResendMsg('Confirmation email resent.')
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

  return (
    <div className={s.page}>
      {/* ── 1. TOP BAR ──────────────────────────────────────────── */}
      <div className={s.topBar}>
        <a href="https://rivetdog.com" style={{ textDecoration: 'none' }}><Logo variant="full" /></a>
      </div>

      {/* ── 2. HERO ─────────────────────────────────────────────── */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <h1 className={s.heroH1}>
            First 25 trade pros in every state lock $79.99/mo — for life.
          </h1>
          <p className={s.heroSub}>
            The field OS built by a contractor's developer. Measure, estimate, track, and get paid — priced like the small business you actually are.
          </p>

          <div className={s.chips}>
            <span className={s.chip}><Shield size={14} style={{ color: 'var(--color-primary)' }} /> 14-day free trial</span>
            <span className={s.chip}><Check size={14} style={{ color: 'var(--color-primary)' }} /> Cancel anytime</span>
            <span className={s.chip}><Lock size={14} style={{ color: 'var(--color-primary)' }} /> Locked for life</span>
          </div>

          {/* State scarcity */}
          <div className={s.stateBox}>
            <div className={s.stateLabel}>Where do you work?</div>
            <select
              className={s.stateSelect}
              value={heroState}
              onChange={e => handleHeroStateChange(e.target.value)}
            >
              <option value="">Select your state</option>
              {US_STATES.map(st => <option key={st.code} value={st.code}>{st.name}</option>)}
            </select>

            {scarcityLoading && (
              <p className={s.scarcitySub} style={{ marginTop: 12 }}>Checking availability...</p>
            )}

            {(() => {
              // No state selected, RPC in flight, errored, or returned nothing
              // -> render NOTHING. Silence beats a false promise.
              if (scarcityLoading || !heroState || !scarcity) return null

              const capStatement = (
                <>
                  <p className={s.scarcityLine}>
                    Only {scarcity.spots_total} founder spots per state.
                  </p>
                  <p className={s.scarcitySub}>
                    When {stateName} fills, the price goes up.
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
                    Only {scarcity.spots_remaining} founder {scarcity.spots_remaining === 1 ? 'spot' : 'spots'} left in {stateName}.
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
                    {scarcity.plan_name} in {stateName} is full.
                  </p>
                  <p className={s.scarcitySub}>
                    Join {scarcity.next_tier_name} at ${scarcity.next_tier_price}/mo.
                  </p>
                </>
              )
            })()}
          </div>

        </div>

        {/* ── Form card (RIGHT column) ────────────────────────── */}
        <div className={s.formCard} ref={formRef}>
          <h2 className={s.formTitle}>Start your free trial</h2>

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
              <input id="companyName" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Leave blank if you work under your own name." autoComplete="organization" />
            </div>

            <div className={formStyles.nameRow}>
              <div className={formStyles.field}>
                <label htmlFor="state">State</label>
                <select id="state" value={state} onChange={e => handleHeroStateChange(e.target.value)} style={selectStyle} required>
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

          <p className={formStyles.footer}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>
      </div>

      {/* ── 3. DEMO VIDEOS (below the fold) ─────────────────────── */}
      <div className={s.strip}>
        <h2 className={s.stripTitle}>See it work</h2>
        <div className={s.demoGrid}>
          {DEMOS.map(d => (
            <DemoCard key={d.id} id={d.id} label={d.label} />
          ))}
        </div>
      </div>

      {/* ── 4. NARRATIVE STRIP ──────────────────────────────────── */}
      <div className={s.strip}>
        <h2 className={s.stripTitle}>Start the Bid. Win the Bid. Perform the Job. Get Paid.</h2>
        <div className={s.narrativeGrid}>
          {NARRATIVE.map(n => (
            <div key={n.step} className={s.narrativeCard}>
              <div className={s.narrativeStep}>Step {n.step}</div>
              <n.icon size={28} style={{ color: 'var(--color-primary)', marginBottom: 8 }} />
              <div className={s.narrativeLabel}>{n.title}</div>
              <div className={s.narrativeDesc}>{n.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. TESTIMONIALS ─────────────────────────────────────── */}
      <div className={s.strip} style={{ borderTop: '1px solid var(--color-border)' }}>
        <h2 className={s.stripTitle}>What contractors are saying</h2>
        <div className={s.testimonialGrid}>
          <div className={s.testimonialCard}>
            <p className={s.testimonialQuote}>
              "RivetDog replaced three tools we were duct-taping together. My crews actually use it."
            </p>
            <p className={s.testimonialAttrib}>— Andrew Abraham, Operations Director, Central Custom Painting</p>
          </div>
          <div className={s.testimonialCard}>
            <p className={s.testimonialQuote}>
              "I finished a takeoff for a commercial roof. I was impressed at how easy it was to complete. The tools are simple and easy to navigate and I found no bugs."
            </p>
            <p className={s.testimonialAttrib}>— Matt Harmon, CEO, ACI Construction</p>
          </div>
        </div>
      </div>

      {/* ── 6. OFFER FAQ ────────────────────────────────────────── */}
      <div className={s.strip}>
        <h2 className={s.stripTitle}>Common questions</h2>
        <div className={s.faqList}>
          <div className={s.faqItem}>
            <p className={s.faqQ}>How does the free trial work?</p>
            <p className={s.faqA}>
              14 days free, full access. We take your card at signup so nothing interrupts your work when the trial ends — cancel anytime from your settings before then and you're not charged.
            </p>
          </div>
          <div className={s.faqItem}>
            <p className={s.faqQ}>What does "locked for life" mean?</p>
            <p className={s.faqA}>
              The first 25 trade pros in each state lock the $79.99/mo founder rate permanently on the base plan. As we grow, new signups pay more — your rate never changes.
            </p>
          </div>
        </div>
      </div>

      {/* ── 7. FINAL CTA ────────────────────────────────────────── */}
      <div className={s.finalCta}>
        <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)', marginBottom: 8 }}>
          $79.99/mo — locked for life.
        </p>
        <p style={{ fontSize: 15, color: 'var(--color-text-muted)', marginBottom: 24 }}>
          14-day free trial. Cancel anytime.
        </p>
        <button className={s.ctaButton} onClick={scrollToForm}>
          Lock your founder rate — start free
        </button>
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
