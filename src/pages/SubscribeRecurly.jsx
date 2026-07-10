import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { RECURLY_PUBLIC_KEY } from '../lib/config'
import { usePlan } from '../lib/plans'
import { resolveEntitlements } from '../lib/entitlements'
import AppHeader from '../components/AppHeader'

// Inject Recurly.js once
function useRecurlyScript() {
  const [ready, setReady] = useState(!!window.recurly)
  useEffect(() => {
    if (window.recurly) { setReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://js.recurly.com/v4/recurly.js'
    script.async = true
    script.onload = () => setReady(true)
    document.head.appendChild(script)
  }, [])
  return ready
}

export default function SubscribeRecurly() {
  const { user, company } = useAuth()
  const rawPlan = usePlan(company?.plan_key)
  const entitlements = company ? resolveEntitlements(company, rawPlan) : null
  const recurlyReady = useRecurlyScript()
  const formRef = useRef(null)
  const cardRef = useRef(null)
  const threeDSContainerRef = useRef(null)
  const recurlyInstance = useRef(null)
  const cardElement = useRef(null)

  const [status, setStatus] = useState('idle') // idle | tokenizing | submitting | 3ds | success | error
  const [message, setMessage] = useState('')
  const [subscriptionId, setSubscriptionId] = useState(null)
  const [cardMounted, setCardMounted] = useState(false)

  // Configure Recurly + mount card element.
  // Depends on `company` so the effect retries after the form mounts
  // (cardRef is null while the spinner renders for company === null).
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
      cardElement.current = card
      setCardMounted(true)
    } catch (err) {
      setStatus('error')
      setMessage('Failed to initialize Recurly: ' + err.message)
    }
  }, [recurlyReady, cardMounted, company])

  const callCheckout = useCallback(async (billingToken, threeDSResult) => {
    setStatus('submitting')
    setMessage('Processing payment...')
    try {
      const body = { billing_token: billingToken, company_id: company.id }
      if (threeDSResult) {
        body.three_d_secure_action_result_token_id = threeDSResult
      }
      const { data, error } = await supabase.functions.invoke('recurly-checkout', { body })
      if (error) throw new Error(error.message || 'Edge function error')
      if (data?.error) throw new Error(data.error)

      if (data?.requires_3ds) {
        handle3DS(data.three_d_secure_action_token_id, billingToken)
        return
      }

      if (data?.success) {
        setStatus('success')
        setSubscriptionId(data.subscription_id)
        setMessage(`Subscription active (${data.status}). ID: ${data.subscription_id}`)
        return
      }

      throw new Error('Unexpected response')
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }, [company?.id])

  function handle3DS(actionTokenId, billingToken) {
    setStatus('3ds')
    setMessage('3DS challenge — complete the verification in the window below.')
    try {
      const risk = recurlyInstance.current.Risk()
      const threeDSecure = risk.ThreeDSecure({ actionTokenId })

      threeDSecure.on('token', (resultToken) => {
        setMessage('3DS verified — completing subscription...')
        callCheckout(billingToken, resultToken.id)
      })

      threeDSecure.on('error', (err) => {
        setStatus('error')
        setMessage('3DS failed: ' + (err.message || err.code || 'Unknown error'))
      })

      if (threeDSContainerRef.current) {
        threeDSecure.attach(threeDSContainerRef.current)
      }
    } catch (err) {
      setStatus('error')
      setMessage('3DS init failed: ' + err.message)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!recurlyInstance.current || !company) return

    // Client-side AVS field validation before tokenizing
    const form = formRef.current
    const missing = []
    if (!form.querySelector('[data-recurly="address1"]')?.value?.trim()) missing.push('Address')
    if (!form.querySelector('[data-recurly="city"]')?.value?.trim()) missing.push('City')
    if (!form.querySelector('[data-recurly="postal_code"]')?.value?.trim()) missing.push('Postal code')
    if (!form.querySelector('[data-recurly="country"]')?.value?.trim()) missing.push('Country')
    if (missing.length > 0) {
      setStatus('error')
      setMessage('Missing billing address fields: ' + missing.join(', '))
      return
    }

    setStatus('tokenizing')
    setMessage('Tokenizing card...')

    recurlyInstance.current.token(formRef.current, (err, token) => {
      if (err) {
        setStatus('error')
        setMessage('Card error: ' + (err.message || err.fields?.join(', ') || 'Invalid card'))
        return
      }
      callCheckout(token.id)
    })
  }

  if (!company) {
    return (
      <>
        <AppHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="spinner" />
        </div>
      </>
    )
  }

  return (
    <>
      <AppHeader />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ maxWidth: 480, width: '100%', background: 'var(--color-surface)', borderRadius: 12, padding: '40px 32px', boxShadow: 'var(--shadow-lg)' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, color: 'var(--color-text)', marginBottom: 4 }}>
            Recurly Checkout — Phase 0
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 24 }}>
            Test charge via Recurly + Authorize.Net. Company: <strong>{company.name}</strong>
            {' '}| Price: <strong>${entitlements?.priceMonthly ?? 'NOT SET'}</strong>/mo{company.locked_price_monthly != null ? ' (locked)' : ''}
          </p>

          {status === 'success' ? (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '16px 20px', fontSize: 14, color: '#22c55e' }}>
              {message}
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  Cardholder name
                </label>
                <input
                  type="text"
                  data-recurly="first_name"
                  placeholder="First"
                  required
                  style={{ width: 'calc(50% - 6px)', marginRight: 12, padding: '10px 12px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box' }}
                />
                <input
                  type="text"
                  data-recurly="last_name"
                  placeholder="Last"
                  required
                  style={{ width: 'calc(50% - 6px)', padding: '10px 12px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Billing address (AVS required by Authorize.Net) */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  Billing address
                </label>
                <input
                  type="text"
                  data-recurly="address1"
                  placeholder="Street address"
                  required
                  style={{ width: '100%', marginBottom: 8, padding: '10px 12px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    data-recurly="city"
                    placeholder="City"
                    required
                    style={{ flex: 2, padding: '10px 12px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <input
                    type="text"
                    data-recurly="state"
                    placeholder="State"
                    style={{ flex: 1, padding: '10px 12px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    data-recurly="postal_code"
                    placeholder="Postal code"
                    required
                    style={{ flex: 1, padding: '10px 12px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <input
                    type="text"
                    data-recurly="country"
                    placeholder="Country"
                    defaultValue="US"
                    required
                    style={{ flex: 1, padding: '10px 12px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  Card details
                </label>
                <div
                  ref={cardRef}
                  style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 12px', background: 'var(--color-bg)', minHeight: 44 }}
                />
              </div>

              {status === 'error' && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
                  {message}
                </div>
              )}

              {(status === 'tokenizing' || status === 'submitting') && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>{message}</p>
              )}

              <button
                type="submit"
                disabled={!cardMounted || status === 'tokenizing' || status === 'submitting' || status === '3ds'}
                style={{
                  width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 700,
                  background: '#f27243', color: '#fff', border: 'none', borderRadius: 8,
                  cursor: (status === 'tokenizing' || status === 'submitting') ? 'wait' : 'pointer',
                  opacity: (!cardMounted || status === 'tokenizing' || status === 'submitting' || status === '3ds') ? 0.6 : 1,
                }}
              >
                {status === 'tokenizing' ? 'Tokenizing...'
                  : status === 'submitting' ? 'Processing...'
                  : status === '3ds' ? '3DS in progress...'
                  : `Pay $${entitlements?.priceMonthly ?? '??'}`}
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

          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 20, textAlign: 'center' }}>
            Phase 0 diagnostic — Recurly + Authorize.Net 3DS proof. Not customer-facing.
          </p>
        </div>
      </div>
    </>
  )
}
