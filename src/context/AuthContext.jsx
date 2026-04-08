import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// AuthContext holds the currently logged-in user so any component in the app
// can access it without passing it down through props manually.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // On first load, check if there's already a logged-in session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for future login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

// useAuth() is a shortcut hook — any component can call useAuth() to get the user
export function useAuth() {
  return useContext(AuthContext)
}
