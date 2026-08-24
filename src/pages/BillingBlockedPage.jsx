import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { ONBOARDING_CALENDAR_URL } from '../lib/config'

// headline/body/cta hold i18n keys under billing:blocked.*; resolved with t().
//
// This page is the HARD STOP at the end of the app-owned trial. Every reason
// routes to /subscribe, which is the founders-spot claim page. Claiming from
// HERE charges immediately (the trial end is already in the past, so
// recurly-checkout pins the Recurly trial to now) — the trialBody copy says so.
const STATUS_MESSAGES = {
  trial_expired: {
    headline: 'billing:blocked.trialExpiredHeadline',
    // body is built in the component — trial length comes from the company row.
    body: null,
    cta: 'billing:blocked.trialExpiredCta',
    ctaTo: '/subscribe',
  },
  past_due: {
    headline: 'billing:blocked.pastDueHeadline',
    body: 'billing:blocked.pastDueBody',
    cta: 'billing:blocked.pastDueCta',
    ctaTo: '/subscribe',
  },
  paused: {
    headline: 'billing:blocked.pausedHeadline',
    body: 'billing:blocked.pausedBody',
    cta: 'billing:blocked.pausedCta',
    ctaTo: '/subscribe',
  },
  suspended: {
    headline: 'billing:blocked.suspendedHeadline',
    body: 'billing:blocked.suspendedBody',
    cta: 'billing:blocked.suspendedCta',
    ctaTo: '/subscribe',
  },
  canceled: {
    headline: 'billing:blocked.canceledHeadline',
    body: 'billing:blocked.canceledBody',
    cta: 'billing:blocked.canceledCta',
    ctaTo: '/subscribe',
  },
}

const CALENDAR_URL = ONBOARDING_CALENDAR_URL

export default function BillingBlockedPage({ company, reason }) {
  const { t } = useTranslation()
  const key = reason || company?.subscription_status || 'suspended'
  const msg = STATUS_MESSAGES[key] ?? STATUS_MESSAGES.suspended
  const isTrialExpired = key === 'trial_expired'
  const body = isTrialExpired
    ? t('billing:blocked.trialBody', { days: company?.trial_duration_days ?? 14 })
    : t(msg.body)

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
          {t(msg.headline)}
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
          {t(msg.cta)}
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
              {t('billing:blocked.bookCall')}
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
              {t('billing:blocked.goToSettings')}
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
            {t('billing:blocked.signOut')}
          </button>
        </div>

        <p style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
          {t('billing:blocked.needHelp')} <a href="mailto:info@rivetdog.com" style={{ color: 'var(--color-primary)' }}>info@rivetdog.com</a>
        </p>
      </div>
    </div>
  )
}
