import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PasswordRecoveryHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (location.pathname !== '/change-password') {
          navigate('/change-password', { replace: true })
        }
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [navigate, location.pathname])

  return null
}
