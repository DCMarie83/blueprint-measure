import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Lightweight "does the Lite family have any content?" probe for the header nav.
// Academy and Resources are global (platform) content — not company-scoped — so
// two head-only COUNT queries answer whether the lite audience set ('all','lite')
// has at least one active row. The result is cached at module scope for the whole
// page-load session: the header mounts/remounts on every route change, and we do
// not want a count round-trip each time. Dee publishing the first lite row turns
// the section on for lite tenants on their next full load.
//
// `enabled` should be (isLite && resolved) so the probe never fires for the
// contractor family (whose nav is untouched) or before the plan family resolves.
const LITE_AUDIENCES = ['all', 'lite']
let cache = null // { academy: boolean, resources: boolean }

export function useLiteNavSections(enabled) {
  const [sections, setSections] = useState(cache || { academy: false, resources: false })

  useEffect(() => {
    if (!enabled || cache) return
    let cancelled = false
    ;(async () => {
      const [vidRes, resRes] = await Promise.all([
        supabase.from('academy_videos')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .in('audience', LITE_AUDIENCES),
        supabase.from('resources')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .in('audience', LITE_AUDIENCES),
      ])
      if (cancelled) return
      const next = {
        academy: !vidRes.error && (vidRes.count ?? 0) > 0,
        resources: !resRes.error && (resRes.count ?? 0) > 0,
      }
      cache = next
      setSections(next)
    })()
    return () => { cancelled = true }
  }, [enabled])

  return sections
}
