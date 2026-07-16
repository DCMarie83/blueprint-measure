import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(null) // null = unknown, true/false
  const [userProfile, setUserProfile] = useState(null)
  const [userProfileLoading, setUserProfileLoading] = useState(false)
  const [company, setCompany] = useState(null)
  const [companyLoading, setCompanyLoading] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [superAdminChecked, setSuperAdminChecked] = useState(false)

  const refreshCompany = useCallback(async (companyId) => {
    const cid = companyId || userProfile?.company_id
    if (!cid) return
    setCompanyLoading(true)
    try {
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('id', cid)
        .single()
      setCompany(data)
    } catch {
      // fail open
    } finally {
      setCompanyLoading(false)
    }
  }, [userProfile?.company_id])

  const refreshUserProfile = useCallback(async () => {
    if (!user?.id) return
    setUserProfileLoading(true)
    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()
      setUserProfile(data)
      if (data) setSetupComplete(!!data.setup_completed_at)
    } catch {
      // fail open
    } finally {
      setUserProfileLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        const completed = await checkSetupComplete(u.id)
        setSetupComplete(completed)
      }
    }).catch(() => {
      // getSession can reject (e.g. auth lock contention on slow iOS Safari).
      // Treat as "no session" — anonymous pages like /signup must still render.
      setUser(null)
    }).finally(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Listener stays synchronous — no Supabase queries here.
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('bpm_password_recovery_pending', 'true')
      }
      const u = session?.user ?? null
      setUser(u)
      if (!u) {
        setSetupComplete(null)
        setUserProfile(null)
        setCompany(null)
        setIsSuperAdmin(false)
        setSuperAdminChecked(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load full user_profiles row when user changes — separate from onAuthStateChange
  useEffect(() => {
    if (!user?.id) return
    refreshUserProfile()
  }, [user?.id, refreshUserProfile])

  // Load company when userProfile loads/changes — separate effect to avoid coupling
  useEffect(() => {
    if (!userProfile?.company_id) {
      setCompany(null)
      return
    }
    refreshCompany(userProfile.company_id)
  }, [userProfile?.company_id, refreshCompany])

  // Check super-admin status when user changes — separate effect, async RPC call.
  useEffect(() => {
    if (!user?.id) {
      setIsSuperAdmin(false)
      setSuperAdminChecked(true)
      return
    }
    setSuperAdminChecked(false)
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.rpc('is_super_admin')
        if (!cancelled) setIsSuperAdmin(!!data)
      } catch {
        if (!cancelled) setIsSuperAdmin(false)
      } finally {
        if (!cancelled) setSuperAdminChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  return (
    <AuthContext.Provider value={{ user, loading, setupComplete, setSetupComplete, userProfile, userProfileLoading, refreshUserProfile, company, companyLoading, refreshCompany, isSuperAdmin, superAdminChecked }}>
      {children}
    </AuthContext.Provider>
  )
}

async function checkSetupComplete(userId) {
  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('setup_completed_at')
      .eq('user_id', userId)
      .single()
    return !!data?.setup_completed_at
  } catch {
    return true // fail open — don't block users if query fails
  }
}

export function useAuth() {
  return useContext(AuthContext)
}
