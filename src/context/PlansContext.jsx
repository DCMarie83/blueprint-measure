import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { GRANDFATHER_DEFAULTS } from '../lib/plans'

const STALE_TTL = 5 * 60 * 1000 // 5 minutes

const PlansContext = createContext({ plans: [], loading: true, error: null, refetch: () => {} })

export function PlansProvider({ children }) {
  const { user } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const lastFetch = useRef(0)
  const fetching = useRef(false)

  const fetchPlans = useCallback(async () => {
    if (fetching.current) return
    fetching.current = true
    try {
      const { data, error: fetchErr } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      if (fetchErr) throw fetchErr
      setPlans(data ?? [])
      setError(null)
      lastFetch.current = Date.now()
    } catch (err) {
      setError(err.message ?? 'Failed to load plans')
    } finally {
      setLoading(false)
      fetching.current = false
    }
  }, [])

  // Fetch when user becomes authenticated
  useEffect(() => {
    if (!user) {
      setPlans([])
      setLoading(false)
      return
    }
    fetchPlans()
  }, [user, fetchPlans])

  // Staleness check — called by consumers via usePlans
  const checkStale = useCallback(() => {
    if (!user) return
    if (Date.now() - lastFetch.current > STALE_TTL) {
      fetchPlans()
    }
  }, [user, fetchPlans])

  return (
    <PlansContext.Provider value={{ plans, loading, error, refetch: fetchPlans, checkStale }}>
      {children}
    </PlansContext.Provider>
  )
}

export function usePlans() {
  const ctx = useContext(PlansContext)
  // Trigger staleness check on access
  ctx.checkStale()
  return { plans: ctx.plans, loading: ctx.loading, error: ctx.error, refetch: ctx.refetch }
}

export function usePlan(planKey) {
  const { plans } = usePlans()
  if (!planKey) return null
  return plans.find(p => p.key === planKey) ?? null
}

export function useCompanyPlan(company) {
  const { plans } = usePlans()
  if (!company) return null
  if (company.subscription_status === 'pilot') {
    return {
      ...GRANDFATHER_DEFAULTS,
      key: 'pilot',
      display_name: 'Pilot',
      unlimited: true,
    }
  }
  const plan = plans.find(p => p.key === company.plan_key)
  if (plan) return {
    ...plan,
    monthly_price: company.locked_price_monthly ?? plan.monthly_price,
    annual_price: company.locked_price_annual ?? plan.annual_price,
  }
  return GRANDFATHER_DEFAULTS
}
