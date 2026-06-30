import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const STATUS_MESSAGES = {
  suspended: {
    headline: 'Subscription suspended',
    body: 'Your subscription is suspended. Please update your payment method to restore access.',
  },
  canceled: {
    headline: 'Subscription canceled',
    body: 'Your subscription has been canceled. Please reactivate to continue using RivetDog.',
  },
  past_due: {
    headline: 'Payment overdue',
    body: 'Your payment is overdue. Your access has been paused until payment is updated.',
  },
  trial_expired: {
    headline: 'Your trial has ended',
    body: 'Your 14-day free trial is over. Book an onboarding call to get set up and activated — we\'ll walk you through everything and get your account live.',
  },
}

const CALENDAR_URL = import.meta.env.VITE_ONBOARDING_CALENDAR_URL

export default function BillingBlockedPage({ company, reason }) {
  const key = reason || company?.subscription_status || 'suspended'
  const msg = STATUS_MESSAGES[key] ?? STATUS_MESSAGES.suspended
  const isTrialExpired = key === 'trial_expired'

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--color-bg)', padding: 24,
    }}>
      <div style={{
        maxWidth: 440, width: '100%', textAlign: 'center',
        background: 'var(--color-surface)', borderRadius: 12,
        padding: '48px 32px', boxShadow: 'var(--shadow-lg)',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800,
          fontSize: 24, color: 'var(--color-text)', marginBottom: 12,
        }}>
          {msg.headline}
        </h1>
        <p style={{
          color: 'var(--color-text-muted)', fontSize: 15,
          lineHeight: 1.6, marginBottom: 32,
        }}>
          {msg.body}
        </p>

        <Link
          to="/subscribe"
          style={{
            display: 'inline-block', padding: '12px 32px',
            background: '#f27243', color: '#fff', borderRadius: 8,
            fontWeight: 600, fontSize: 15, textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          {isTrialExpired ? 'Subscribe' : 'Reactivate'}
        </Link>

        {isTrialExpired && CALENDAR_URL && (
          <div style={{ marginBottom: 16 }}>
            <a
              href={CALENDAR_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-primary)', fontSize: 14,
                textDecoration: 'underline',
              }}
            >
              Or book your onboarding call
            </a>
          </div>
        )}

        {!isTrialExpired && (
          <div style={{ marginBottom: 16 }}>
            <Link
              to="/settings"
              style={{
                color: 'var(--color-primary)', fontSize: 14,
                textDecoration: 'underline',
              }}
            >
              Go to Account Settings
            </Link>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <button
            onClick={handleSignOut}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-muted)', fontSize: 14,
              textDecoration: 'underline',
            }}
          >
            Sign out
          </button>
        </div>

        <p style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
          Need help? Contact <a href="mailto:info@rivetdog.com" style={{ color: 'var(--color-primary)' }}>info@rivetdog.com</a>
        </p>
      </div>
    </div>
  )
}
