import { useAuth } from '../../context/AuthContext'
import BillingBlockedPage from '../../pages/BillingBlockedPage'

const GRACE_DAYS = 3
const SUPER_ADMIN_EMAIL = 'main@ngautomationhub.com'

function isBlocked(user, company) {
  if (!user || !company) return false
  if (user.email === SUPER_ADMIN_EMAIL) return false
  const status = company.subscription_status
  if (!status) return false
  if (['active', 'trialing', 'pilot', 'paused'].includes(status)) return false
  if (['suspended', 'canceled'].includes(status)) return true
  if (status === 'past_due') {
    const changedAt = company.subscription_status_changed_at
    if (!changedAt) return false
    const days = (Date.now() - new Date(changedAt).getTime()) / (1000 * 60 * 60 * 24)
    return days > GRACE_DAYS
  }
  return false
}

export default function SubscriptionGate({ children }) {
  const { user, company, companyLoading } = useAuth()
  if (companyLoading) return null
  if (isBlocked(user, company)) return <BillingBlockedPage company={company} />
  return children
}
