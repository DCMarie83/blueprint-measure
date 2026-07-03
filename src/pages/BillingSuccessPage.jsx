import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppHeader from '../components/AppHeader'

const POLL_INTERVAL = 2000
const MAX_POLLS = 15

const ACTIVE_STATUSES = new Set(['active', 'pilot'])

export default function BillingSuccessPage() {
  const { company, refreshCompany } = useAuth()
  const [activated, setActivated] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const pollCount = useRef(0)

  useEffect(() => {
    refreshCompany()

    const interval = setInterval(async () => {
      pollCount.current += 1
      await refreshCompany()
      if (pollCount.current >= MAX_POLLS) {
        clearInterval(interval)
        setTimedOut(true)
      }
    }, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [refreshCompany])

  useEffect(() => {
    if (company && ACTIVE_STATUSES.has(company.subscription_status)) {
      setActivated(true)
    }
  }, [company])

  return (
    <>
      <AppHeader />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: 'var(--color-surface)', borderRadius: 12, padding: '48px 32px', boxShadow: 'var(--shadow-lg)' }}>
          {activated ? (
            <>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
                You're all set
              </h1>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
                Your subscription is active. Welcome to RivetDog.
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
                {timedOut ? 'Payment received' : 'Activating your account...'}
              </h1>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
                {timedOut
                  ? 'Your account will activate shortly. You can start using RivetDog right away.'
                  : 'Confirming your payment — this usually takes just a few seconds.'}
              </p>
              {!timedOut && <div className="spinner" style={{ margin: '0 auto 24px' }} />}
            </>
          )}
          <Link to="/dashboard" style={{ display: 'inline-block', padding: '12px 32px', background: 'var(--color-primary)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            Go to Dashboard
          </Link>
        </div>
      </div>
    </>
  )
}
