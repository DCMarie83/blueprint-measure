import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCompanyPlan } from '../lib/plans'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'

export default function SubscribePage() {
  const { company } = useAuth()
  const companyPlan = useCompanyPlan(company)
  const [term, setTerm] = useState('monthly')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  if (!company || !companyPlan) {
    return (
      <>
        <AppHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="spinner" />
        </div>
      </>
    )
  }

  // Active subscription
  if (company.subscription_status === 'active') {
    return (
      <>
        <AppHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
          <div style={{ maxWidth: 440, textAlign: 'center', background: 'var(--color-surface)', borderRadius: 12, padding: '48px 32px', boxShadow: 'var(--shadow-lg)' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
              You're subscribed
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              Your <strong>{companyPlan.display_name}</strong> plan is active.
            </p>
            <Link to="/dashboard" style={{ display: 'inline-block', padding: '12px 32px', background: '#f27243', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
              Go to Dashboard
            </Link>
          </div>
        </div>
      </>
    )
  }

  // Pilot accounts
  if (company.subscription_status === 'pilot') {
    return (
      <>
        <AppHeader />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
          <div style={{ maxWidth: 440, textAlign: 'center', background: 'var(--color-surface)', borderRadius: 12, padding: '48px 32px', boxShadow: 'var(--shadow-lg)' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
              Pilot Account
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              Your pilot account is free — no subscription needed.
            </p>
            <Link to="/dashboard" style={{ display: 'inline-block', padding: '12px 32px', background: '#f27243', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
              Go to Dashboard
            </Link>
          </div>
        </div>
      </>
    )
  }

  // Subscribe flow
  const monthlyPrice = companyPlan.monthly_price
  const annualPrice = companyPlan.annual_price
  const yearlySavings = monthlyPrice != null && annualPrice != null
    ? ((monthlyPrice * 12) - annualPrice).toFixed(2)
    : null
  const displayPrice = term === 'yearly' ? annualPrice : monthlyPrice
  const priceSuffix = term === 'yearly' ? '/yr' : '/mo'

  async function handleSubscribe() {
    setLoading(true)
    setErr(null)
    const { data, error } = await supabase.functions.invoke('create-checkout', { body: { term } })
    if (error || !data?.url) {
      setErr(error?.message || data?.error || 'Could not start checkout')
      setLoading(false)
      return
    }
    window.location.href = data.url
  }

  return (
    <>
      <AppHeader />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ maxWidth: 440, width: '100%', background: 'var(--color-surface)', borderRadius: 12, padding: '48px 32px', boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 8 }}>
            Subscribe to {companyPlan.display_name}
          </h1>

          {/* Term toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0, margin: '24px 0 20px', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <button
              onClick={() => setTerm('monthly')}
              style={{
                flex: 1, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: term === 'monthly' ? '#f27243' : 'var(--color-bg)',
                color: term === 'monthly' ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setTerm('yearly')}
              style={{
                flex: 1, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: term === 'yearly' ? '#f27243' : 'var(--color-bg)',
                color: term === 'yearly' ? '#fff' : 'var(--color-text-muted)',
              }}
            >
              Yearly
            </button>
          </div>

          {/* Price */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--color-text)' }}>
              ${displayPrice != null ? Number(displayPrice).toFixed(2) : '—'}
            </span>
            <span style={{ fontSize: 16, color: 'var(--color-text-muted)', fontWeight: 500 }}>
              {priceSuffix}
            </span>
          </div>

          {term === 'yearly' && yearlySavings && Number(yearlySavings) > 0 && (
            <p style={{ color: '#22c55e', fontSize: 14, fontWeight: 600, marginBottom: 24 }}>
              Save ${yearlySavings} per year vs. monthly
            </p>
          )}
          {term === 'monthly' && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 24 }}>
              Switch to yearly to save
            </p>
          )}

          {err && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#fca5a5' }}>
              {err}
            </div>
          )}

          <button
            onClick={handleSubscribe}
            disabled={loading}
            style={{
              width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              background: '#f27243', color: '#fff', border: 'none', borderRadius: 8,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Redirecting to checkout...' : 'Subscribe'}
          </button>

          <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 20 }}>
            Secure checkout powered by Chargebee. Cancel anytime.
          </p>
        </div>
      </div>
    </>
  )
}
