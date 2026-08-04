// App-wide i18next runtime. Imported FIRST in src/main.jsx, before <App/> renders,
// so the very first paint already has the resolved language. This is the ONLY
// i18n instance for the authenticated app and public funnel; the /try demo keeps
// its own self-contained tryLang context and mirrors its choice into the same
// localStorage key so a /try to /signup handoff carries the language.
//
// Locked decisions honored here:
//  - i18next + react-i18next only. No languagedetector plugin, no backend plugin.
//  - en.json is imported statically; es.json is dynamically imported on first
//    switch to 'es' and registered with addResourceBundle.
//  - localStorage key 'rivetdog_language', values 'en' | 'es' only.
//  - Boot chain: localStorage -> navigator.language starting with 'es' -> 'en'.
//    The saved profile preference is applied later (AppLayout), and always wins.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en.json'

export const STORAGE_KEY = 'rivetdog_language'
export const SUPPORTED = ['en', 'es']

// Guards a raw value down to a supported code, or null when unusable.
function normalize(value) {
  return SUPPORTED.includes(value) ? value : null
}

// Boot resolution chain: saved choice -> browser 'es*' -> 'en'.
function resolveInitialLanguage() {
  let saved = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    saved = null
  }
  const savedNorm = normalize(saved)
  if (savedNorm) return savedNorm

  let nav = ''
  try {
    nav = (navigator.language || '').toLowerCase()
  } catch {
    nav = ''
  }
  if (nav.startsWith('es')) return 'es'

  return 'en'
}

// Synchronous init with English only. Spanish is added on demand (setLanguage).
i18n
  .use(initReactI18next)
  .init({
    resources: { en },
    lng: resolveInitialLanguage(),
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common'],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })

// Keep <html lang> honest for a11y/SEO. index.html ships a static lang="en";
// this override runs on every change (including the initial one below).
i18n.on('languageChanged', (lng) => {
  try {
    document.documentElement.lang = lng
  } catch {
    /* SSR/no-document — non-fatal */
  }
})
// Stamp the resolved boot language immediately (the event above only fires on
// CHANGE, not on the initial init, so set it once explicitly here).
try {
  document.documentElement.lang = i18n.language
} catch {
  /* non-fatal */
}

// Tracks whether the es bundle has been fetched + registered, so repeat switches
// to 'es' do not re-import.
let esLoaded = false

// setLanguage(lang): the single entry point for changing app language.
//  - Lazy-loads + registers the es bundle the first time es is requested.
//  - Always writes localStorage 'rivetdog_language'.
//  - Idempotent: safe to call repeatedly with the same value.
export async function setLanguage(lang) {
  const next = normalize(lang) || 'en'

  if (next === 'es' && !esLoaded) {
    try {
      const mod = await import('../locales/es.json')
      i18n.addResourceBundle('es', 'common', (mod.default || mod).common, true, true)
      esLoaded = true
    } catch (err) {
      // Bundle fetch failed (offline, chunk error): stay on current language
      // rather than switching to an empty resource set.
      console.error('Failed to load Spanish bundle', err)
      return
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* storage unavailable — non-fatal, language still applies for this session */
  }

  if (i18n.language !== next) {
    await i18n.changeLanguage(next)
  }
}

// If the boot chain resolved to 'es', the static init only holds 'en'. Kick the
// async load so the first paint upgrades to Spanish as soon as the bundle lands.
if (i18n.language === 'es') {
  esLoaded = false
  setLanguage('es')
}

export default i18n
