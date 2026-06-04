import { useAuth } from '../context/AuthContext'

const CALENDAR_URL = import.meta.env.VITE_ONBOARDING_CALENDAR_URL

export default function TrialBanner() {
  const { company } = useAuth()

  if (!company) return null
  if (company.subscription_status !== 'trialing') return null
  if (!company.trial_ends_at) return null

  const msLeft = new Date(company.trial_ends_at).getTime() - Date.now()
  if (msLeft <= 0) return null // expired — SubscriptionGate handles this

  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
  const label = daysLeft <= 1 ? 'Last day of your trial' : `${daysLeft} days left in your trial`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
      padding: '8px 16px', background: '#26464c', color: '#fff', fontSize: 13, fontWeight: 500,
    }}>
      <span>{label}</span>
      {CALENDAR_URL && (
        <a
          href={CALENDAR_URL}
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
