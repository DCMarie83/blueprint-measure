import { useLayoutEffect, useEffect } from 'react'
import { Outlet, Link, useSearchParams, useLocation } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import markUrl from '../../assets/brand/mark-orange.png'
import { utmQuery } from './tryUtm'
import { TryLangProvider, useTryLang, useTryTheme } from './tryLang'
import { tr } from './tryStrings'
import TryLanguageGate from './TryLanguageGate'
import s from './try.module.css'

const UTM_STORAGE_KEY = 'rivetdog_utms'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

function TryLayoutInner() {
  const { lang, setLang } = useTryLang()
  const { theme, setTheme } = useTryTheme()
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  // Reveal screens carry a sticky bottom email-gate; omit the flow footer there
  // so nothing collides with the gate (the gate carries brand context instead).
  const isReveal = pathname.endsWith('/reveal')

  // Apply the visitor's EXPLICIT theme choice (manual choice wins over the OS
  // prefers-color-scheme mirror); restore the prior data-theme on unmount.
  useLayoutEffect(() => {
    const root = document.documentElement
    const prior = root.getAttribute('data-theme')
    root.setAttribute('data-theme', theme)
    return () => {
      if (prior === null) root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', prior)
    }
  }, [theme])

  // Merge any incoming UTM params into the existing 'rivetdog_utms' blob.
  useEffect(() => {
    const incoming = {}
    for (const key of UTM_KEYS) {
      const val = searchParams.get(key)
      if (val) incoming[key] = val
    }
    if (Object.keys(incoming).length === 0) return
    let existing = {}
    try {
      const raw = localStorage.getItem(UTM_STORAGE_KEY)
      if (raw) existing = JSON.parse(raw) || {}
    } catch { existing = {} }
    try {
      localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify({ ...existing, ...incoming }))
    } catch { /* storage unavailable — non-fatal */ }
  }, [searchParams])

  // No language yet → the arrival gate blocks the whole /try tree.
  if (!lang) {
    return (
      <div className={s.shell}>
        <TryLanguageGate onPick={setLang} />
      </div>
    )
  }

  const c = tr('common', lang)

  return (
    <div className={s.shell}>
      <header className={s.header}>
        <Link to="/" className={s.headerBrand} aria-label="RivetDog home">
          <img src={markUrl} alt="RivetDog" className={s.headerLogo} />
        </Link>
        <div className={s.headerRight}>
          <div className={s.langToggle} role="group" aria-label="Language">
            <button className={`${s.langChip} ${lang === 'en' ? s.langChipOn : ''}`} onClick={() => setLang('en')}>EN</button>
            <button className={`${s.langChip} ${lang === 'es' ? s.langChipOn : ''}`} onClick={() => setLang('es')}>ES</button>
          </div>
          <button
            className={s.themeBtn}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link to={`/signup${utmQuery()}`} className={s.signupLink}>{c.signup}</Link>
        </div>
      </header>
      <main className={s.main}>
        <Outlet />
      </main>
      {!isReveal && (
        <footer className={s.poweredFooter}>
          <img src={markUrl} alt="" className={s.poweredMark} />
          <span>Powered by RivetDog</span>
        </footer>
      )}
    </div>
  )
}

export default function TryLayout() {
  return (
    <TryLangProvider>
      <TryLayoutInner />
    </TryLangProvider>
  )
}
