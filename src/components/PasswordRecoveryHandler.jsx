import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const RECOVERY_FLAG_KEY = 'bpm_password_recovery_pending'

export default function PasswordRecoveryHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  // Detect recovery from URL hash on EVERY page load (covers cases where Supabase drops user on /).
  useEffect(() => {
    const hash = window.location.hash
    const search = window.location.search

    const isRecoveryFlow =
      hash.includes('type=recovery') ||
      search.includes('type=recovery')

    if (isRecoveryFlow) {
      sessionStorage.setItem(RECOVERY_FLAG_KEY, 'true')
    }

    // If flag is set and we're not already on /change-password, redirect there
    if (sessionStorage.getItem(RECOVERY_FLAG_KEY) === 'true' && location.pathname !== '/change-password') {
      navigate('/change-password', { replace: true })
    }
  }, [navigate, location.pathname])

  // Also listen for PASSWORD_RECOVERY event for completeness — synchronous handler only.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem(RECOVERY_FLAG_KEY, 'true')
        if (location.pathname !== '/change-password') {
          navigate('/change-password', { replace: true })
        }
      }
    })
    return () => subscription?.unsubscribe()
  }, [navigate, location.pathname])

  return null
}
