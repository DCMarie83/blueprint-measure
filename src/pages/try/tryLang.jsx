import { createContext, useContext, useState, useCallback } from 'react'

// Self-contained /try preferences: language (gate shows until chosen) and theme
// (explicit user choice, default dark, overrides the OS prefers-color-scheme).
// NOT the app-wide i18n/theme.
const LANG_KEY = 'rivetdog_try_lang'
const THEME_KEY = 'rivetdog_try_theme'
const TryLangContext = createContext(null)

export function TryLangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(LANG_KEY) } catch { return null }
  })
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'dark' } catch { return 'dark' }
  })

  const setLang = useCallback((next) => {
    setLangState(next)
    try { localStorage.setItem(LANG_KEY, next) } catch { /* no-op */ }
  }, [])

  const setTheme = useCallback((next) => {
    setThemeState(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* no-op */ }
  }, [])

  return (
    <TryLangContext.Provider value={{ lang, setLang, theme, setTheme }}>
      {children}
    </TryLangContext.Provider>
  )
}

export function useTryLang() {
  const ctx = useContext(TryLangContext)
  if (!ctx) throw new Error('useTryLang must be used within TryLangProvider')
  return { lang: ctx.lang, setLang: ctx.setLang }
}

export function useTryTheme() {
  const ctx = useContext(TryLangContext)
  if (!ctx) throw new Error('useTryTheme must be used within TryLangProvider')
  return { theme: ctx.theme, setTheme: ctx.setTheme }
}
