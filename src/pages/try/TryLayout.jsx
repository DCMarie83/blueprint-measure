import { useLayoutEffect, useEffect } from 'react'
import { Outlet, Link, useSearchParams } from 'react-router-dom'
import lockupUrl from '../../assets/brand/lockup-orange.png'
import { utmQuery } from './tryUtm'
import { TryLangProvider, useTryLang } from './tryLang'
import { tr } from './tryStrings'
import TryLanguageGate from './TryLanguageGate'
import s from './try.module.css'

const UTM_STORAGE_KEY = 'rivetdog_utms'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

function resolveForcedTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function TryLayoutInner() {
  const { lang, setLang } = useTryLang()
  const [searchParams] = useSearchParams()

  // Force-match theme before paint; restore on unmount (unchanged from before).
  useLayoutEffect(() => {
    const root = document.documentElement
    const prior = root.getAttribute('data-theme')
    const apply = () => root.setAttribute('data-theme', resolveForcedTheme())
    apply()
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener?.('change', apply)
    return () => {
      mq?.removeEventListener?.('change', apply)
      if (prior === null) root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', prior)
    }
  }, [])

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
          <img src={lockupUrl} alt="RivetDog" className={s.headerLogo} />
        </Link>
        <div className={s.headerRight}>
          <div className={s.langToggle} role="group" aria-label="Language">
            <button className={`${s.langChip} ${lang === 'en' ? s.langChipOn : ''}`} onClick={() => setLang('en')}>EN</button>
            <button className={`${s.langChip} ${lang === 'es' ? s.langChipOn : ''}`} onClick={() => setLang('es')}>ES</button>
          </div>
          <Link to={`/signup${utmQuery()}`} className={s.signupLink}>{c.signup}</Link>
        </div>
      </header>
      <main className={s.main}>
        <Outlet />
      </main>
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
