import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from './useEffectiveCompany'
import { usePlans, useCompanyPlan } from '../context/PlansContext'

// Single source of truth for "is this tenant on the Time & Pay Lite family?".
//
// isLite is derived ENTIRELY from the plan row's `plan_family` column — never
// from plan_key string matching — so renaming or adding Lite plan keys never
// breaks the gate. `resolved` is true only once the company AND the plans list
// have both settled; until then nothing family-gated should render or redirect,
// otherwise a Lite tenant flashes the contractor UI (or gets bounced) during
// the first-paint window where the plan row isn't loaded yet.
export function useIsLite() {
  const { companyResolved } = useAuth()
  const { company } = useEffectiveCompany()
  const { loading: plansLoading } = usePlans()
  const plan = useCompanyPlan(company)

  const resolved = companyResolved && !!company && !plansLoading
  const isLite = resolved ? plan?.plan_family === 'lite' : false

  return { isLite, resolved }
}
