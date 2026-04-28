import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(null) // null = unknown, true/false

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null
      setUser(u)

      // Skip profile re-check on USER_UPDATED — fired by
      // auth.updateUser() during registration. The profile query
      // inside this listener was stealing the auth-token lock from
      // RegisterPage's user_profiles UPDATE, causing setup_completed_at
      // to never be written. Setup status doesn't change on password
      // updates, so there's nothing to re-check.
      if (event === 'USER_UPDATED') return

      if (u) {
        const completed = await checkSetupComplete(u.id)
        setSetupComplete(completed)
      } else {
        setSetupComplete(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, setupComplete, setSetupComplete }}>
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
