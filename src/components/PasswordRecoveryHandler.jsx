import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const RECOVERY_FLAG_KEY = 'bpm_password_recovery_pending'

export default function PasswordRecoveryHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  // Verify token_hash from recovery email link on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')

    if (tokenHash && type === 'recovery') {
      sessionStorage.setItem(RECOVERY_FLAG_KEY, 'true')
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
        if (error) {
          console.error('[PasswordRecoveryHandler] verifyOtp failed:', error)
          navigate('/change-password?error=' + encodeURIComponent(error.message), { replace: true })
        } else {
          navigate('/change-password', { replace: true })
        }
      })
    }
  }, [navigate])

  // Detect recovery from URL hash on every page load (legacy backup)
  useEffect(() => {
    const hash = window.location.hash
    const search = window.location.search

    const isRecoveryFlow =
      hash.includes('type=recovery') ||
      search.includes('type=recovery')

    if (isRecoveryFlow) {
      sessionStorage.setItem(RECOVERY_FLAG_KEY, 'true')
    }

    if (sessionStorage.getItem(RECOVERY_FLAG_KEY) === 'true' && location.pathname !== '/change-password') {
      navigate('/change-password', { replace: true })
    }
  }, [navigate, location.pathname])

  // PASSWORD_RECOVERY event listener (backup)
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
