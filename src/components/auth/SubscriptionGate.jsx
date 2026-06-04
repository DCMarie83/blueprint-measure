import { useAuth } from '../../context/AuthContext'
import BillingBlockedPage from '../../pages/BillingBlockedPage'

const GRACE_DAYS = 3

function blockReason(user, company, isSuperAdmin) {
  if (!user || !company) return null
  if (isSuperAdmin) return null
  const status = company.subscription_status
  if (!status) return null
  if (status === 'trialing') {
    if (company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
      return 'trial_expired'
    }
    return null
  }
  if (['active', 'pilot', 'paused'].includes(status)) return null
  if (['suspended', 'canceled'].includes(status)) return status
  if (status === 'past_due') {
    const changedAt = company.subscription_status_changed_at
    if (!changedAt) return null
    const days = (Date.now() - new Date(changedAt).getTime()) / (1000 * 60 * 60 * 24)
    return days > GRACE_DAYS ? 'past_due' : null
  }
  return null
}

export default function SubscriptionGate({ children }) {
  const { user, company, companyLoading, isSuperAdmin } = useAuth()
  if (companyLoading) return null
  const reason = blockReason(user, company, isSuperAdmin)
  if (reason) return <BillingBlockedPage company={company} reason={reason} />
  return children
}
