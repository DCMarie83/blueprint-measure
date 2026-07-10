// ════════════════════════════════════════════════════════════
// useEntitlements — React hook wrapping the entitlements resolver
//
// STAGE 1: Additive only. Does NOT modify AuthContext, PlansContext,
// or useSession. Nothing calls this at runtime yet — it exists so
// future stages can import it to replace frozen-snapshot reads.
//
// Usage (future, not wired yet):
//   const { seats, features, priceMonthly, isExempt } = useEntitlements()
// ════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePlans } from '../lib/plans'
import { resolveEntitlements } from '../lib/entitlements'

/**
 * Resolve the current user's company entitlements using live plan data.
 *
 * Reads company from AuthContext and plan from PlansContext.
 * Returns the resolved entitlements (seats, features, prices, isExempt).
 * Returns null while data is still loading.
 */
export function useEntitlements() {
  const { company, companyLoading } = useAuth()
  const { plans, loading: plansLoading } = usePlans()

  return useMemo(() => {
    if (companyLoading || plansLoading || !company) return null

    const plan = company.plan_key
      ? plans.find(p => p.key === company.plan_key) ?? null
      : null

    return resolveEntitlements(company, plan)
  }, [company, companyLoading, plans, plansLoading])
}
