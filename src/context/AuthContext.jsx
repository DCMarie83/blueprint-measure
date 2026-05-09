import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(null) // null = unknown, true/false
  const [userProfile, setUserProfile] = useState(null)
  const [userProfileLoading, setUserProfileLoading] = useState(false)

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
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Listener stays synchronous — no Supabase queries here.
      const u = session?.user ?? null
      setUser(u)
      if (!u) {
        setSetupComplete(null)
        setUserProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load full user_profiles row when user changes — separate from onAuthStateChange
  useEffect(() => {
    if (!user?.id) return
    refreshUserProfile()
  }, [user?.id, refreshUserProfile])

  return (
    <AuthContext.Provider value={{ user, loading, setupComplete, setSetupComplete, userProfile, userProfileLoading, refreshUserProfile }}>
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
