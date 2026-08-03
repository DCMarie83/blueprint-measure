import { createContext, useContext, useState, useCallback } from 'react'

// Self-contained /try language state. localStorage-backed, default null so the
// language gate shows on first arrival. NOT the app-wide i18n.
const STORAGE_KEY = 'rivetdog_try_lang'
const TryLangContext = createContext(null)

export function TryLangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
  })
  const setLang = useCallback((next) => {
    setLangState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* no-op */ }
  }, [])
  return <TryLangContext.Provider value={{ lang, setLang }}>{children}</TryLangContext.Provider>
}

export function useTryLang() {
  const ctx = useContext(TryLangContext)
  if (!ctx) throw new Error('useTryLang must be used within TryLangProvider')
  return ctx
}
