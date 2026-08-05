import { lazy } from 'react'

// One shared flag across all lazy chunks: a single hard reload after a deploy
// re-fetches the current HTML + every current chunk hash, so we only need to
// reload once even if multiple chunks are stale.
const RELOAD_FLAG = 'try-chunk-reloaded'

// lazyWithReload(importFn): like React.lazy, but tolerant of the classic
// "Failed to fetch dynamically imported module" that happens when cached HTML
// requests an old chunk hash that a new deploy removed.
//
// On a failed dynamic import:
//   - if we haven't already retried this session: set a sessionStorage flag and
//     force a full page reload to pull the fresh HTML + current chunk hashes,
//     returning a never-resolving module so nothing renders before the reload.
//   - if we already retried once: rethrow, so a genuinely-missing chunk surfaces
//     the real error instead of looping.
// A successful load clears the flag, so a FUTURE deploy can retry again.
export default function lazyWithReload(importFn) {
  return lazy(() =>
    importFn()
      .then((mod) => {
        try { sessionStorage.removeItem(RELOAD_FLAG) } catch { /* storage unavailable — non-fatal */ }
        return mod
      })
      .catch((err) => {
        let alreadyReloaded = false
        try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === 'true' } catch { /* non-fatal */ }

        if (!alreadyReloaded) {
          try { sessionStorage.setItem(RELOAD_FLAG, 'true') } catch { /* non-fatal */ }
          window.location.reload()
          // Pending forever: keeps the Suspense fallback up and prevents any
          // render until the reload swaps the whole page out.
          return new Promise(() => {})
        }

        // Already reloaded once this session and it still failed — surface the
        // real error rather than reloading in a loop.
        throw err
      })
  )
}
