import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ONBOARDING_CALENDAR_URL } from '../lib/config'

const STATUS_MESSAGES = {
  trial_expired: {
    headline: 'Your free trial has ended',
    // body is built in the component — trial length comes from the company row.
    body: null,
    cta: 'Subscribe now',
    ctaTo: '/subscribe',
  },
  past_due: {
    headline: "Your payment didn't go through",
    body: 'We were unable to process your most recent payment. Please update your payment method to restore access.',
    cta: 'Update payment',
    ctaTo: '/subscribe',
  },
  paused: {
    headline: 'Your subscription is paused',
    body: 'Your subscription is currently paused. Resume to restore full access to your account.',
    cta: 'Resume subscription',
    ctaTo: '/subscribe',
  },
  suspended: {
    headline: 'Subscription suspended',
    body: 'Your subscription has been suspended. Please resubscribe to continue using RivetDog.',
    cta: 'Resubscribe',
    ctaTo: '/subscribe',
  },
  canceled: {
    headline: 'Subscription canceled',
    body: 'Your subscription has been canceled. Resubscribe to continue using RivetDog.',
    cta: 'Resubscribe',
    ctaTo: '/subscribe',
  },
}

const CALENDAR_URL = ONBOARDING_CALENDAR_URL

export default function BillingBlockedPage({ company, reason }) {
  const key = reason || company?.subscription_status || 'suspended'
  const msg = STATUS_MESSAGES[key] ?? STATUS_MESSAGES.suspended
  const isTrialExpired = key === 'trial_expired'
  const body = isTrialExpired
    ? `Your ${company?.trial_duration_days ?? 14}-day free trial is over. Subscribe now to keep your account and all your data.`
    : msg.body

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
          {body}
        </p>

        <Link
          to={msg.ctaTo}
          style={{
            display: 'inline-block', padding: '12px 32px',
            background: 'var(--color-primary)', color: '#fff', borderRadius: 8,
            fontWeight: 600, fontSize: 15, textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          {msg.cta}
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
