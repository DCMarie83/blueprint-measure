import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { TRIAL_GRACE_DAYS, ONBOARDING_CALENDAR_URL } from '../lib/config'

export default function TrialBanner() {
  const { company } = useAuth()

  if (!company) return null
  if (company.subscription_status !== 'trialing') return null
  if (!company.trial_ends_at) return null

  const now = Date.now()
  const trialEnd = new Date(company.trial_ends_at).getTime()
  const graceCutoff = trialEnd + TRIAL_GRACE_DAYS * 24 * 60 * 60 * 1000

  // Past grace → blocked by SubscriptionGate, banner won't render
  if (now >= graceCutoff) return null

  const msLeftTrial = trialEnd - now
  const isGrace = msLeftTrial <= 0

  if (isGrace) {
    // Grace window: trial ended, lock approaching
    const msUntilLock = graceCutoff - now
    const daysUntilLock = Math.ceil(msUntilLock / (1000 * 60 * 60 * 24))
    const urgency = daysUntilLock <= 1
      ? 'Full lock tomorrow'
      : `Full lock in ${daysUntilLock} days`

    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 16px', background: '#7c2d12', color: '#fff', fontSize: 13, fontWeight: 600,
      }}>
        <span>Your trial has ended — subscribe to keep your account. {urgency}.</span>
        <Link
          to="/subscribe"
          style={{
            padding: '4px 14px', background: '#f27243', color: '#fff', borderRadius: 6,
            fontWeight: 700, fontSize: 13, textDecoration: 'none',
          }}
        >
          Subscribe
        </Link>
        {ONBOARDING_CALENDAR_URL && (
          <a
            href={ONBOARDING_CALENDAR_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#fbbf24', fontWeight: 700, textDecoration: 'underline',
              fontSize: 13,
            }}
          >
            Book your onboarding call
          </a>
        )}
      </div>
    )
  }

  // Active trial
  const daysLeft = Math.ceil(msLeftTrial / (1000 * 60 * 60 * 24))
  const label = daysLeft <= 1 ? 'Last day of your trial' : `${daysLeft} days left in your trial`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
      padding: '8px 16px', background: '#26464c', color: '#fff', fontSize: 13, fontWeight: 500,
    }}>
      <span>{label}</span>
      <Link
        to="/subscribe"
        style={{
          padding: '4px 14px', background: '#f27243', color: '#fff', borderRadius: 6,
          fontWeight: 600, fontSize: 13, textDecoration: 'none',
        }}
      >
        Subscribe
      </Link>
      {ONBOARDING_CALENDAR_URL && (
        <a
          href={ONBOARDING_CALENDAR_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#f27243', fontWeight: 600, textDecoration: 'underline',
            fontSize: 13,
          }}
        >
          Book your onboarding call
        </a>
      )}
    </div>
  )
}
