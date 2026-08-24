import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useImpersonation } from '../context/ImpersonationContext'
import { useCompanyPlan } from '../lib/plans'
import { supabase } from '../lib/supabase'
import { RECURLY_PUBLIC_KEY, GOOGLE_ADS_TAG_ID, GOOGLE_ADS_CLAIM_CONVERSION_LABEL } from '../lib/config'
import Logo from '../components/brand/Logo'
import LanguageToggle from '../components/LanguageToggle'

// Minimal chrome for the checkout page: logo + a Sign out escape hatch,
// nothing that competes with the card form. Deliberately NOT AppHeader
// (which brings TrialBanner, nav, hamburger, and UserMenu with it).
function CheckoutHeader() {
  const { t } = useTranslation()
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}>
      <Link to="/" aria-label={t('checkout:header.homeAriaLabel')}>
        <Logo />
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <LanguageToggle />
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-muted)', fontSize: 14, textDecoration: 'underline',
          }}
        >
          {t('checkout:header.signOut')}
        </button>
      </div>
    </header>
  )
}

// Inject Recurly.js v4 once
function useRecurlyScript() {
  const [ready, setReady] = useState(!!window.recurly)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (window.recurly) { setReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://js.recurly.com/v4/recurly.js'
    script.async = true
    script.onload = () => setReady(true)
    script.onerror = () => setFailed(true)
    document.head.appendChild(script)
    // Timeout: if script hasn't loaded in 8s, assume blocked
    const t = setTimeout(() => { if (!window.recurly) setFailed(true) }, 8000)
    return () => clearTimeout(t)
  }, [])
  return { ready, failed }
}

const INPUT_STYLE = {
  padding: '10px 12px', fontSize: 14,
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
  background: 'var(--color-bg)', color: 'var(--color-text)',
  outline: 'none', boxSizing: 'border-box',
}

export default function RecurlyCheckout() {
  const { t, i18n } = useTranslation()
  const { company, refreshCompany } = useAuth()
  const { isImpersonating } = useImpersonation()
  const companyPlan = useCompanyPlan(company)
  const navigate = useNavigate()
  const { ready: recurlyReady, failed: recurlyFailed } = useRecurlyScript()
  const formRef = useRef(null)
  const cardRef = useRef(null)
  const threeDSContainerRef = useRef(null)
  const recurlyInstance = useRef(null)
  const cardElementRef = useRef(null)

  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [cardMounted, setCardMounted] = useState(false)
  const [mountTimeout, setMountTimeout] = useState(false)
  const [term, setTerm] = useState('monthly')

  // ── Derived pricing ────────────────────────────────────────────────
  // Declared ABOVE callCheckout so the claim conversion can report the real
  // charged amount. useCompanyPlan already resolves locked_price_* ??
  // plan.* — a NULL company lock falls back to the live plan price.
  const monthlyPrice = companyPlan?.monthly_price ?? company?.locked_price_monthly
  const annualPrice = companyPlan?.annual_price ?? company?.locked_price_annual
  // No annual price -> hide the annual option so an unbuyable term can't be picked.
  const annualAvailable = annualPrice != null
  const price = term === 'yearly' ? annualPrice : monthlyPrice
  const priceSuffix = term === 'yearly' ? t('checkout:form.suffixYearly') : t('checkout:form.suffixMonthly')
  const annualSavings = (annualAvailable && monthlyPrice != null)
    ? (Number(monthlyPrice) * 12 - Number(annualPrice))
    : null
  const planName = companyPlan?.display_name || t('checkout:form.planNameFallback')

  // ── Claim framing ──────────────────────────────────────────────────
  // The trial is APP-owned and already running by the time anyone reaches
  // this page — the signup trigger wrote trialing + trial_ends_at, and no
  // Recurly subscription exists until the spot is claimed here. A mid-trial
  // claim puts the card on file now and lands the first charge on the
  // ORIGINAL trial end date (recurly-checkout pins subBody.trial_ends_at to
  // it). Once that date has passed — or the status is trial_expired —
  // claiming charges today, so the copy has to say so.
  const trialEndsAt = company?.trial_ends_at ? new Date(company.trial_ends_at) : null
  const trialActive = company?.subscription_status === 'trialing'
    && trialEndsAt !== null
    && !Number.isNaN(trialEndsAt.getTime())
    && trialEndsAt.getTime() > Date.now()
  const firstChargeDate = trialActive
    ? trialEndsAt.toLocaleDateString(i18n.language?.startsWith('es') ? 'es-US' : 'en-US',
        { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  // Dormant claim conversion. Fires only with a real label AND a live gtag —
  // identical to the demo-lead pattern. Never throws, never blocks the
  // redirect: a blocked or unconfigured tag must not cost the user their
  // successful claim.
  const fireClaimConversion = useCallback(() => {
    try {
      if (!GOOGLE_ADS_CLAIM_CONVERSION_LABEL) return
      if (typeof window.gtag !== 'function') return
      window.gtag('event', 'conversion', {
        send_to: `${GOOGLE_ADS_TAG_ID}/${GOOGLE_ADS_CLAIM_CONVERSION_LABEL}`,
        value: price != null ? Number(price) : undefined,
        currency: 'USD',
      })
    } catch { /* analytics must never break checkout */ }
  }, [price])

  // Configure Recurly + mount card element
  useEffect(() => {
    if (!recurlyReady || !window.recurly || cardMounted || !company) return
    if (!cardRef.current) return
    try {
      const r = window.recurly
      r.configure(RECURLY_PUBLIC_KEY)
      recurlyInstance.current = r

      const elements = r.Elements()
      const card = elements.CardElement()
      card.attach(cardRef.current)
      cardElementRef.current = card
      setCardMounted(true)
    } catch (err) {
      setStatus('error')
      setMessage(t('checkout:form.initFailed', { error: err.message }))
    }
  }, [recurlyReady, cardMounted, company])

  // Detect card-mount failure (ad-blocker case)
  useEffect(() => {
    if (cardMounted || recurlyFailed) return
    const t = setTimeout(() => { if (!cardMounted) setMountTimeout(true) }, 6000)
    return () => clearTimeout(t)
  }, [cardMounted, recurlyFailed])

  const callCheckout = useCallback(async (billingToken, threeDSResult) => {
    if (isImpersonating) {
      setStatus('error')
      setMessage(t('common:guard.impersonationBilling'))
      return
    }
    setStatus('submitting')
    setMessage(t('checkout:form.settingUp'))
    try {
      const body = { billing_token: billingToken, company_id: company.id, term }
      if (threeDSResult) {
        body.three_d_secure_action_result_token_id = threeDSResult
      }
      const { data, error } = await supabase.functions.invoke('recurly-checkout', { body })
      if (error) throw new Error(error.message || t('checkout:error.checkoutFailed'))
      if (data?.error) throw new Error(data.error)

      if (data?.requires_3ds) {
        handle3DS(data.three_d_secure_action_token_id, billingToken)
        return
      }

      if (data?.success) {
        setStatus('success')
        setMessage(t('checkout:success.message'))
        fireClaimConversion()
        await refreshCompany()
        setTimeout(() => navigate('/dashboard'), 1500)
        return
      }

      throw new Error(t('checkout:error.unexpectedResponse'))
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }, [company?.id, navigate, refreshCompany, isImpersonating, term, fireClaimConversion])

  function handle3DS(actionTokenId, billingToken) {
    setStatus('3ds')
    setMessage(t('checkout:form.threeDSPrompt'))
    try {
      const risk = recurlyInstance.current.Risk()
      const threeDSecure = risk.ThreeDSecure({ actionTokenId })

      threeDSecure.on('token', (resultToken) => {
        setMessage(t('checkout:form.threeDSVerified'))
        callCheckout(billingToken, resultToken.id)
      })

      threeDSecure.on('error', (err) => {
        setStatus('error')
        setMessage(t('checkout:form.verificationFailed', { error: err.message || err.code || t('common:misc.unknownError') }))
      })

      if (threeDSContainerRef.current) {
        threeDSecure.attach(threeDSContainerRef.current)
      }
    } catch (err) {
      setStatus('error')
      setMessage(t('checkout:form.verificationSetupFailed', { error: err.message }))
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!recurlyInstance.current || !company) return

    const form = formRef.current
    const missing = []
    if (!form.querySelector('[data-recurly="address1"]')?.value?.trim()) missing.push(t('checkout:form.fieldAddress'))
    if (!form.querySelector('[data-recurly="city"]')?.value?.trim()) missing.push(t('checkout:form.fieldCity'))
    if (!form.querySelector('[data-recurly="postal_code"]')?.value?.trim()) missing.push(t('checkout:form.fieldPostalCode'))
    if (!form.querySelector('[data-recurly="country"]')?.value?.trim()) missing.push(t('checkout:form.fieldCountry'))
    if (missing.length > 0) {
      setStatus('error')
      setMessage(t('checkout:form.missingAddress', { fields: missing.join(', ') }))
      return
    }

    setStatus('tokenizing')
    setMessage(t('checkout:form.securingCard'))

    recurlyInstance.current.token(formRef.current, (err, token) => {
      if (err) {
        setStatus('error')
        setMessage(t('checkout:form.cardError', { error: err.message || err.fields?.join(', ') || t('checkout:form.invalidCardDetails') }))
        return
      }
      callCheckout(token.id)
    })
  }

  // Already subscribed
  if (company?.subscription_status === 'active') {
    return (
      <>
        <CheckoutHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
          <div style={{ maxWidth: 440, textAlign: 'center', background: 'var(--color-surface)', borderRadius: 12, padding: '48px 32px', boxShadow: 'var(--shadow-lg)' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>{t('checkout:success.subscribedTitle')}</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              <Trans
                i18nKey="checkout:success.planActive"
                values={{ plan: companyPlan?.display_name || t('checkout:success.planFallback') }}
              >
                Your <strong>{'{{plan}}'}</strong> is active.
              </Trans>
            </p>
            <Link to="/dashboard" style={{ display: 'inline-block', padding: '12px 32px', background: '#f27243', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
              {t('checkout:success.goToDashboard')}
            </Link>
          </div>
        </div>
      </>
    )
  }

  // Pilot accounts
  if (company?.subscription_status === 'pilot') {
    return (
      <>
        <CheckoutHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
          <div style={{ maxWidth: 440, textAlign: 'center', background: 'var(--color-surface)', borderRadius: 12, padding: '48px 32px', boxShadow: 'var(--shadow-lg)' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>{t('checkout:success.pilotTitle')}</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              {t('checkout:success.pilotBody')}
            </p>
            <Link to="/dashboard" style={{ display: 'inline-block', padding: '12px 32px', background: '#f27243', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
              {t('checkout:success.goToDashboard')}
            </Link>
          </div>
        </div>
      </>
    )
  }

  if (!company) {
    return (
      <>
        <CheckoutHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="spinner" />
        </div>
      </>
    )
  }

  const blocked = recurlyFailed || mountTimeout

  return (
    <>
      <CheckoutHeader />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ maxWidth: 480, width: '100%', background: 'var(--color-surface)', borderRadius: 12, padding: '40px 32px', boxShadow: 'var(--shadow-lg)' }}>

          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: '#26464c', marginBottom: 6 }}>
              {t('checkout:form.title')}
            </h1>
            {annualAvailable && (
              <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', margin: '10px 0 12px' }}>
                <button type="button" onClick={() => setTerm('monthly')}
                  style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: term === 'monthly' ? '#f27243' : 'transparent',
                    color: term === 'monthly' ? '#fff' : 'var(--color-text-muted)' }}>
                  {t('checkout:form.termMonthly')}
                </button>
                <button type="button" onClick={() => setTerm('yearly')}
                  style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: term === 'yearly' ? '#f27243' : 'transparent',
                    color: term === 'yearly' ? '#fff' : 'var(--color-text-muted)' }}>
                  {t('checkout:form.termAnnual')}
                </button>
              </div>
            )}
            <p style={{ fontSize: 15, color: 'var(--color-text-muted)', margin: 0 }}>
              {t('checkout:form.planPrice', { plan: planName, price: price != null ? Number(price).toFixed(2) : '??', suffix: priceSuffix })}
            </p>
            {term === 'yearly' && annualSavings != null && annualSavings > 0 && (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {t('checkout:form.annualSavings', { amount: annualSavings.toFixed(2) })}
              </p>
            )}
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.55 }}>
              {t('checkout:form.claimExplainer')}
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 600, marginTop: 6, lineHeight: 1.55 }}>
              {trialActive
                ? t('checkout:form.claimFirstCharge', { date: firstChargeDate })
                : t('checkout:form.claimBillingToday')}
            </p>
          </div>

          {blocked ? (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '16px 20px', fontSize: 14, color: 'var(--color-text)', lineHeight: 1.5 }}>
              <strong>{t('checkout:form.blockedTitle')}</strong><br />
              {t('checkout:form.blockedBody')}
            </div>
          ) : status === 'success' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '16px 20px', fontSize: 15, color: '#22c55e', fontWeight: 600, marginBottom: 16 }}>
                {message}
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('checkout:success.redirecting')}</p>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit}>
              {/* Cardholder name */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  {t('checkout:form.cardholderName')}
                </label>
                <input type="text" data-recurly="first_name" placeholder={t('checkout:form.firstNamePlaceholder')} required
                  style={{ ...INPUT_STYLE, width: 'calc(50% - 6px)', marginRight: 12 }} />
                <input type="text" data-recurly="last_name" placeholder={t('checkout:form.lastNamePlaceholder')} required
                  style={{ ...INPUT_STYLE, width: 'calc(50% - 6px)' }} />
              </div>

              {/* Billing address */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  {t('checkout:form.billingAddress')}
                </label>
                <input type="text" data-recurly="address1" placeholder={t('checkout:form.streetPlaceholder')} required
                  style={{ ...INPUT_STYLE, width: '100%', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" data-recurly="city" placeholder={t('checkout:form.cityPlaceholder')} required
                    style={{ ...INPUT_STYLE, flex: 2 }} />
                  <input type="text" data-recurly="state" placeholder={t('checkout:form.statePlaceholder')}
                    style={{ ...INPUT_STYLE, flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input type="text" data-recurly="postal_code" placeholder={t('checkout:form.postalPlaceholder')} required
                    style={{ ...INPUT_STYLE, flex: 1 }} />
                  <input type="text" data-recurly="country" placeholder={t('checkout:form.countryPlaceholder')} defaultValue="US" required
                    style={{ ...INPUT_STYLE, flex: 1 }} />
                </div>
              </div>

              {/* Card details */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  {t('checkout:form.cardDetails')}
                </label>
                <div ref={cardRef}
                  style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 12px', background: 'var(--color-bg)', minHeight: 44 }} />
              </div>

              {status === 'error' && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
                  {message}
                </div>
              )}

              {(status === 'tokenizing' || status === 'submitting') && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>{message}</p>
              )}

              <button type="submit"
                disabled={!cardMounted || status === 'tokenizing' || status === 'submitting' || status === '3ds'}
                style={{
                  width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 700,
                  background: '#f27243', color: '#fff', border: 'none', borderRadius: 8,
                  cursor: (status === 'tokenizing' || status === 'submitting') ? 'wait' : 'pointer',
                  opacity: (!cardMounted || status === 'tokenizing' || status === 'submitting' || status === '3ds') ? 0.6 : 1,
                }}>
                {status === 'tokenizing' ? t('checkout:form.btnSecuring')
                  : status === 'submitting' ? t('checkout:form.btnSettingUp')
                  : status === '3ds' ? t('checkout:form.btnCompleting')
                  : t('checkout:form.btnSubscribe', { price: price != null ? Number(price).toFixed(2) : '??', suffix: priceSuffix })}
              </button>
            </form>
          )}

          {/* 3DS challenge container */}
          {status === '3ds' && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>{message}</p>
              <div ref={threeDSContainerRef} style={{ minHeight: 400, border: '1px solid var(--color-border)', borderRadius: 8 }} />
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 20, textAlign: 'center' }}>
            {t('checkout:form.footer')}
          </p>
        </div>
      </div>
    </>
  )
}
