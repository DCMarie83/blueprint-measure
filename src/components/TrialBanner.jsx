import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { TRIAL_GRACE_DAYS, ONBOARDING_CALENDAR_URL } from '../lib/config'

export default function TrialBanner() {
  const { t } = useTranslation()
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
  const hasSubscription = !!company.recurly_subscription_id

  if (isGrace) {
    // Subscribed users in grace: payment is auto-processing, no CTA needed
    if (hasSubscription) return null

    // No subscription in grace. Under the no-card model this is the DEFAULT
    // path, not a grandfathered exception: nobody has a Recurly subscription
    // until they claim their founders spot at /subscribe. Last call before
    // SubscriptionGate hard-stops them.
    const msUntilLock = graceCutoff - now
    const daysUntilLock = Math.ceil(msUntilLock / (1000 * 60 * 60 * 24))
    const urgency = daysUntilLock <= 1
      ? t('common:trialBanner.fullLockTomorrow')
      : t('common:trialBanner.fullLockDays', { count: daysUntilLock })

    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 16px', background: '#7c2d12', color: '#fff', fontSize: 13, fontWeight: 600,
      }}>
        <span>{t('common:trialBanner.trialEnded', { urgency })}</span>
        <Link
          to="/subscribe"
          style={{
            padding: '4px 14px', background: '#f27243', color: '#fff', borderRadius: 6,
            fontWeight: 700, fontSize: 13, textDecoration: 'none',
          }}
        >
          {t('common:trialBanner.claimSpot')}
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

  // Active trial. hasSubscription === false is the DEFAULT here — no card is
  // taken at signup, so the claim CTA shows for everyone who hasn't claimed
  // their founders spot yet.
  const daysLeft = Math.ceil(msLeftTrial / (1000 * 60 * 60 * 24))
  const label = daysLeft <= 1 ? t('common:trialBanner.trialLastDay') : t('common:trialBanner.trialDaysLeft', { count: daysLeft })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
      padding: '8px 16px', background: '#26464c', color: '#fff', fontSize: 13, fontWeight: 500,
    }}>
      <span>{label}</span>
      {!hasSubscription && (
        <Link
          to="/subscribe"
          style={{
            padding: '4px 14px', background: '#f27243', color: '#fff', borderRadius: 6,
            fontWeight: 600, fontSize: 13, textDecoration: 'none',
          }}
        >
          {t('common:trialBanner.claimSpot')}
        </Link>
      )}
      {ONBOARDING_CALENDAR_URL && (
        <a
          href={ONBOARDING_CALENDAR_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: hasSubscription ? '#a7c4c9' : '#f27243',
            fontWeight: 600, textDecoration: 'underline',
            fontSize: 13,
          }}
        >
          {t('common:trialBanner.bookCall')}
        </a>
      )}
    </div>
  )
}
