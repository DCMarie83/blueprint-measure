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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Listener stays synchronous — no Supabase queries here.
      // checkSetupComplete is called once on mount via getSession()
      // above. Calling it inside the listener was stealing the
      // auth-token lock from in-flight auth.updateUser() calls
      // during registration, throwing "Lock was released because
      // another request stole it" and breaking signup completely.
      const u = session?.user ?? null
      setUser(u)
      if (!u) setSetupComplete(null)
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
