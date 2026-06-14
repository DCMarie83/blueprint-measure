import { useAuth } from '../../context/AuthContext'
import BillingBlockedPage from '../../pages/BillingBlockedPage'
import { TRIAL_GRACE_DAYS } from '../../lib/config'

const PAST_DUE_GRACE_DAYS = 3

function blockReason(user, company, isSuperAdmin) {
  if (!user || !company) return null
  if (isSuperAdmin) return null
  const status = company.subscription_status
  if (!status) return null
  if (status === 'trialing') {
    // No trial_ends_at → treat as not-yet-expired (defensive)
    if (!company.trial_ends_at) return null
    const trialEnd = new Date(company.trial_ends_at)
    const graceCutoff = new Date(trialEnd.getTime() + TRIAL_GRACE_DAYS * 24 * 60 * 60 * 1000)
    // Active trial or within grace window → allow full access
    if (new Date() < graceCutoff) return null
    // Past grace → hard lock
    return 'trial_expired'
  }
  if (['active', 'pilot', 'paused'].includes(status)) return null
  if (['suspended', 'canceled'].includes(status)) return status
  if (status === 'past_due') {
    const changedAt = company.subscription_status_changed_at
    if (!changedAt) return null
    const days = (Date.now() - new Date(changedAt).getTime()) / (1000 * 60 * 60 * 24)
    return days > PAST_DUE_GRACE_DAYS ? 'past_due' : null
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
