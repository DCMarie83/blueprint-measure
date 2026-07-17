import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

// Lightweight "does the Lite family have any content?" probe for the header nav.
// Academy and Resources are global (platform) content — not company-scoped — so
// two head-only COUNT queries answer whether the lite audience (['lite']) overlaps
// at least one active row's audiences[] array.
//
// Caching rule: POSITIVE results are latched at module scope for the whole
// page-load session (a published section does not un-publish mid-session, so once
// we have seen a row we can stop probing that section). A zero/false/error result
// is NEVER cached — the header remounts on every route change, so an unresolved or
// still-empty section is simply re-probed on the next mount. This keeps a probe
// that ran before auth resolved (or during an impersonation flip) from freezing a
// section OFF for the rest of the session.
//
// `enabled` should be (isLite && resolved) so the probe never fires for the
// contractor family (whose nav is untouched) or before the plan family resolves.
// The probe additionally gates on `companyId` (auth-resolved signal); it changes
// on login and impersonation start/end, which re-runs the effect and re-probes.
const LITE_AUDIENCES = ['lite']
const cache = { academy: false, resources: false } // positives only, never un-set

export function useLiteNavSections(enabled) {
  const { companyId } = useEffectiveCompany()
  const [sections, setSections] = useState({ ...cache })

  useEffect(() => {
    // Gate on auth being resolved: no companyId means the session/user is not
    // ready yet (or is mid-switch) — do not probe, do not cache a negative.
    if (!enabled || !companyId) return

    // Anything already known-positive stays on without a round-trip.
    if (cache.academy && cache.resources) {
      setSections({ ...cache })
      return
    }

    let cancelled = false
    ;(async () => {
      const [vidRes, resRes] = await Promise.all([
        supabase.from('academy_videos')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .overlaps('audiences', LITE_AUDIENCES),
        supabase.from('resources')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .overlaps('audiences', LITE_AUDIENCES),
      ])
      if (cancelled) return

      // On error: treat as unknown — hide the item this mount, do NOT cache, and
      // surface the error in DevTools so a broken probe is visible.
      if (vidRes.error) console.warn('[useLiteNavSections] academy_videos probe failed:', vidRes.error.message)
      if (resRes.error) console.warn('[useLiteNavSections] resources probe failed:', resRes.error.message)

      const academy = !vidRes.error && (vidRes.count ?? 0) > 0
      const resources = !resRes.error && (resRes.count ?? 0) > 0

      // Latch positives for the session; never latch a false/unknown.
      if (academy) cache.academy = true
      if (resources) cache.resources = true

      setSections({
        academy: cache.academy || academy,
        resources: cache.resources || resources,
      })
    })()
    return () => { cancelled = true }
  }, [enabled, companyId])

  return sections
}
