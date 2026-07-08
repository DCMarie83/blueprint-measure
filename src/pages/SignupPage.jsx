import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/config'
import Logo from '../components/brand/Logo'
import { US_STATES } from '../data/usStates'
import { TRADES, DEFAULT_TRADE } from '../constants/trades'
import { Check, Shield, Lock, Ruler, FileText, Clock, DollarSign, ChevronRight } from 'lucide-react'
import formStyles from './LoginPage.module.css'
import s from './SignupPage.module.css'

const selectStyle = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)', padding: '11px 14px', fontSize: 15,
  color: 'var(--color-text)', outline: 'none', width: '100%', boxSizing: 'border-box',
}

const DEMOS = [
  { id: '3LpU-EHk9OY', label: 'Measure', caption: 'Blueprint takeoff in seconds.' },
  { id: 'gTEhwPVKymg', label: 'Estimate', caption: 'Good / Better / Best estimates, fast.' },
  { id: 'qOaL4Mzg6HA', label: 'Manage', caption: 'Crew hours, tracked to the job.' },
]

const NARRATIVE = [
  { step: '1', title: 'Start the Bid', desc: 'Upload a blueprint, set scale, measure every zone in minutes.', icon: Ruler },
  { step: '2', title: 'Win the Bid', desc: 'Send a polished Good / Better / Best estimate your client picks from.', icon: FileText },
  { step: '3', title: 'Perform the Job', desc: 'Track crew time, materials, and expenses against the bid — live.', icon: Clock },
  { step: '4', title: 'Get Paid', desc: 'Invoice from the accepted estimate. Clients pay through their portal.', icon: DollarSign },
]

const FOUNDERS_PLAN_KEY = 'founding_500' // matches plan_key the RPC returns — independent of display name
const FOUNDER_GIFT_LINE = 'Plus a special thank-you gift after 90 days as an active subscriber.' // EDIT: finalize swag copy

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

  // ── Account state (UNCHANGED) ──────────────────────────────
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)

  // ── Business state (UNCHANGED) ─────────────────────────────
  const [companyName, setCompanyName] = useState('')
  const [tradeVertical, setTradeVertical] = useState(DEFAULT_TRADE)
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [brandingChoice, setBrandingChoice] = useState('later')

  // ── UI state (UNCHANGED) ───────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  // ── State scarcity (NEW) ───────────────────────────────────
  const [heroState, setHeroState] = useState('')
  const [scarcity, setScarcity] = useState(null)
  const [scarcityLoading, setScarcityLoading] = useState(false)

  const passwordsMatch = password === confirmPassword
  const canSubmit =
    firstName.trim() && lastName.trim() && email.trim() &&
    password.length >= 8 && passwordsMatch && confirmPassword &&
    companyName.trim() && termsAccepted &&
    addressLine1.trim() && city.trim() && state && zip.trim() && businessPhone.trim()

  // ── handleSubmit (UNCHANGED — identical to original) ───────
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
              if (scarcityLoading || !heroState) return null
              if (!scarcity) {
                // Neutral fallback — no quota row for this state
                return (
                  <p className={s.scarcityLine}>
                    Founder pricing available — $79.99/mo. Cancel anytime.
                  </p>
                )
              }
              const isFoundersTier = scarcity.plan_key === FOUNDERS_PLAN_KEY

              // Branch A — Founders tier, completely open
              if (isFoundersTier && scarcity.spots_remaining === scarcity.spots_total) {
                return (
                  <>
                    <p className={s.scarcityLine}>Claim founder #1 in {stateName}</p>
                    <p className={s.scarcitySub}>
                      Be the first trade pro in your state to lock ${scarcity.monthly_price}/mo for life. {FOUNDER_GIFT_LINE}
                    </p>
                  </>
                )
              }

              // Branch B — Founders tier, partially claimed
              if (isFoundersTier && scarcity.spots_remaining > 0) {
                return (
                  <>
                    <p className={s.scarcityLine}>
                      Only {scarcity.spots_remaining} founder {scarcity.spots_remaining === 1 ? 'spot' : 'spots'} left in {stateName}
                    </p>
                    <p className={s.scarcitySub}>
                      After the first {scarcity.spots_total}, it's {scarcity.next_tier_name} at ${scarcity.next_tier_price}/mo — your rate stays locked.
                    </p>
                  </>
                )
              }

              // Branch C — Founders full, now showing a non-founders tier with room
              if (!isFoundersTier && scarcity.spots_remaining > 0) {
                return (
                  <>
                    <p className={s.scarcityLine}>Founder spots in {stateName} are full</p>
                    <p className={s.scarcitySub}>
                      {scarcity.spots_remaining} {scarcity.plan_name} {scarcity.spots_remaining === 1 ? 'spot' : 'spots'} left at ${scarcity.monthly_price}/mo — still locked for life.
                    </p>
                  </>
                )
              }

              // Branch D — This tier is full (spots_remaining === 0)
              return (
                <>
                  <p className={s.scarcityLine}>{scarcity.plan_name} in {stateName} is full</p>
                  <p className={s.scarcitySub}>
                    Join {scarcity.next_tier_name} at ${scarcity.next_tier_price}/mo.
                  </p>
                </>
              )
            })()}
          </div>

          {/* ── Demo videos (inside hero left column) ────────────── */}
          <div className={s.heroDemos}>
            <h2 className={s.heroDemosTitle}>See it work</h2>
            <div className={s.heroDemoGrid}>
              {DEMOS.map(d => (
                <DemoCard key={d.id} id={d.id} label={d.label} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Form card (RIGHT column) ────────────────────────── */}
        <div className={s.formCard} ref={formRef}>
          <h2 className={s.formTitle}>Start your free trial</h2>

          <form className={formStyles.form} onSubmit={handleSubmit}>
            {/* Your Account */}
            <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 8 }}>Your Account</div>

            <div className={formStyles.nameRow}>
              <div className={formStyles.field}>
                <label htmlFor="firstName">First name</label>
                <input id="firstName" type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" required autoComplete="given-name" />
              </div>
              <div className={formStyles.field}>
                <label htmlFor="lastName">Last name</label>
                <input id="lastName" type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" required autoComplete="family-name" />
              </div>
            </div>

            <div className={formStyles.field}>
              <label htmlFor="signupEmail">Email address</label>
              <input id="signupEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" />
            </div>

            <div className={formStyles.field}>
              <label htmlFor="signupPassword">Password</label>
              <input id="signupPassword" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
            </div>

            <div className={formStyles.field}>
              <label htmlFor="confirmPassword">Confirm password</label>
              <input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" required autoComplete="new-password" />
              {confirmPassword && !passwordsMatch && <div className={formStyles.error}>Passwords don't match</div>}
            </div>

            {/* Your Business */}
            <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginTop: 20, marginBottom: 8, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>Your Business</div>

            <div className={formStyles.nameRow}>
              <div className={formStyles.field}>
                <label htmlFor="companyName">Company name</label>
                <input id="companyName" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Smith Painting LLC" required autoComplete="organization" />
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

            <div className={formStyles.field}>
              <label htmlFor="addressLine1">Street address</label>
              <input id="addressLine1" type="text" value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder="123 Main St" required autoComplete="address-line1" />
            </div>

            <div className={formStyles.field}>
              <label htmlFor="addressLine2">Suite / Unit <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
              <input id="addressLine2" type="text" value={addressLine2} onChange={e => setAddressLine2(e.target.value)} placeholder="Suite 200" autoComplete="address-line2" />
            </div>

            <div className={formStyles.nameRow} style={{ gap: 10 }}>
              <div className={formStyles.field} style={{ flex: 2 }}>
                <label htmlFor="city">City</label>
                <input id="city" type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Columbus" required autoComplete="address-level2" />
              </div>
              <div className={formStyles.field} style={{ flex: 1 }}>
                <label htmlFor="state">State</label>
                <select id="state" value={state} onChange={e => setState(e.target.value)} style={selectStyle} required>
                  <option value="">—</option>
                  {US_STATES.map(st => <option key={st.code} value={st.code}>{st.code}</option>)}
                </select>
              </div>
              <div className={formStyles.field} style={{ flex: 0, minWidth: 90 }}>
                <label htmlFor="zip">Zip</label>
                <input id="zip" type="text" value={zip} onChange={e => setZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} placeholder="43215" required inputMode="numeric" maxLength={5} autoComplete="postal-code" />
              </div>
            </div>

            <div className={formStyles.field}>
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
              {brandingChoice === 'have' && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '8px 0 0', paddingLeft: 24 }}>
                  You'll upload your logo from Settings after your account is active.
                </p>
              )}
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

            {error && <div className={formStyles.error}>{error}</div>}

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
