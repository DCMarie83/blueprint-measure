import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

const POLL_INTERVAL = 2000
const MAX_POLLS = 15

const ACTIVE_STATUSES = new Set(['active', 'pilot'])

export default function BillingSuccessPage() {
  const { t } = useTranslation()
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
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: 'var(--color-surface)', borderRadius: 12, padding: '48px 32px', boxShadow: 'var(--shadow-lg)' }}>
          {activated ? (
            <>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
                {t('billing:success.title')}
              </h1>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
                {t('billing:success.body')}
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
                {timedOut ? t('billing:success.paymentReceived') : t('billing:success.activating')}
              </h1>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
                {timedOut
                  ? t('billing:success.activateShortly')
                  : t('billing:success.confirming')}
              </p>
              {!timedOut && <div className="spinner" style={{ margin: '0 auto 24px' }} />}
            </>
          )}
          <Link to="/dashboard" style={{ display: 'inline-block', padding: '12px 32px', background: 'var(--color-primary)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            {t('billing:success.goToDashboard')}
          </Link>
        </div>
      </div>
    </>
  )
}
