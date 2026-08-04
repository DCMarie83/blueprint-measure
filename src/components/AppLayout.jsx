import { useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import i18n, { setLanguage, STORAGE_KEY, SUPPORTED } from '../lib/i18n'
import AppHeader from './AppHeader'

// The authenticated layout route: renders the shared AppHeader once, then the
// active page through <Outlet/>. Guards resolve ABOVE this in the route tree, so
// the header only paints after auth/family checks pass. AppHeader self-configures
// its Lite vs contractor variant from useIsLite, so no props are needed.
export default function AppLayout() {
  const { user, userProfile, refreshUserProfile } = useAuth()
  // Remembers which signed-in user we already ran the co-capture write for, so a
  // freshly-created null-language profile is seeded exactly once (no write loop).
  const coCaptureFor = useRef(null)

  // Profile-language sync. IMPERSONATION NOTE: every profile read/write here keys
  // on user.id (the signed-in auth user). Impersonation is a client-side
  // "acting as company" overlay that never swaps the auth user, so these always
  // target the admin's OWN row. No isImpersonating guard is needed (guarding
  // would wrongly block an impersonating admin from setting their own language).
  useEffect(() => {
    if (!user?.id || userProfile == null) return

    const pref = userProfile.language
    if (pref && SUPPORTED.includes(pref)) {
      // (a) Saved profile preference wins over the boot/localStorage value.
      if (i18n.language !== pref) setLanguage(pref)
      return
    }

    // (b) Profile language is NULL: land the signup co-capture from localStorage,
    // once per user. This writes the visitor's pre-account choice onto their own
    // row so it becomes the durable preference.
    if (coCaptureFor.current === user.id) return
    let local = null
    try {
      local = localStorage.getItem(STORAGE_KEY)
    } catch {
      local = null
    }
    if (!SUPPORTED.includes(local)) return

    coCaptureFor.current = user.id
    ;(async () => {
      try {
        await supabase.from('user_profiles').update({ language: local }).eq('user_id', user.id)
        await refreshUserProfile()
      } catch (err) {
        console.error('Language co-capture write failed', err)
      }
    })()
  }, [user?.id, userProfile, refreshUserProfile])

  return (
    <>
      <AppHeader />
      <Outlet />
    </>
  )
}
