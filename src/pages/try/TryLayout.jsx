import { useLayoutEffect, useEffect } from 'react'
import { Outlet, Link, useSearchParams } from 'react-router-dom'
import { utmQuery } from './tryUtm'
import s from './try.module.css'

const UTM_STORAGE_KEY = 'rivetdog_utms'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

// Resolve the theme the demo should force: 'light' ONLY when the visitor
// explicitly prefers light; otherwise 'dark' (default dark when unknown).
function resolveForcedTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function TryLayout() {
  const [searchParams] = useSearchParams()

  // Force-match theme WITHOUT a flash and WITHOUT touching global ThemeContext.
  // useLayoutEffect runs before paint, so the attribute is set before the
  // browser paints the first /try frame. On unmount we restore whatever
  // data-theme was present before /try mounted, so leaving the demo cannot
  // corrupt the app's theme.
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

  // Capture UTM params on entry and merge into the existing 'rivetdog_utms'
  // JSON blob (read existing, spread present-only values, write back). Never
  // overwrite existing keys with nulls. This is the only side effect besides
  // theme, and the only thing TryLayout writes anywhere.
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
    } catch {
      existing = {}
    }

    try {
      localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify({ ...existing, ...incoming }))
    } catch {
      /* storage unavailable (private mode / quota) — non-fatal for the demo */
    }
  }, [searchParams])

  return (
    <div className={s.shell}>
      <header className={s.header}>
        <Link to="/" className={s.wordmark} aria-label="RivetDog home">
          Rivet<span className={s.wordmarkAccent}>Dog</span>
        </Link>
        {/* Quiet escape hatch for the already-sold — subordinate to each screen's CTA. */}
        <Link to={`/signup${utmQuery()}`} className={s.signupLink}>Sign up</Link>
      </header>
      <main className={s.main}>
        <Outlet />
      </main>
    </div>
  )
}
