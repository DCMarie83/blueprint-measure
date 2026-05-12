import { useState, useEffect } from 'react'

export function useViewPreference(pageKey, defaultView = 'list') {
  const storageKey = `rivetdog_view_pref_${pageKey}`
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || defaultView
    } catch {
      return defaultView
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, view)
    } catch { /* ignore */ }
  }, [storageKey, view])

  return [view, setView]
}
