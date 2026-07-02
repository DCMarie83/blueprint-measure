import { useAuth } from '../context/AuthContext'
import { useImpersonation } from '../context/ImpersonationContext'

export function useEffectiveCompany() {
  const { userProfile, company } = useAuth()
  const { isImpersonating, actingAsCompanyId, actingAsCompany } = useImpersonation()

  return {
    companyId: isImpersonating ? actingAsCompanyId : (userProfile?.company_id ?? null),
    company: isImpersonating ? actingAsCompany : (company ?? null),
    isImpersonating,
  }
}
