import { useState } from 'react'

// Collapse state remembered for the session (sessionStorage, matching the
// session-scoped conventions used for impersonation state). Key it per
// surface, e.g. `client_<id>_invoices`.
export function useSessionCollapse(key, defaultCollapsed) {
  const storageKey = `rivetdog_collapse_${key}`
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved != null) return saved === '1'
    } catch { /* storage unavailable */ }
    return defaultCollapsed
  })
  function setCollapsed(next) {
    setCollapsedState(next)
    try { sessionStorage.setItem(storageKey, next ? '1' : '0') } catch { /* ignore */ }
  }
  return [collapsed, setCollapsed]
}
