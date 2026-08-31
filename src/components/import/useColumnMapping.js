import { useState } from 'react'
import { supabase } from '../../lib/supabase'

// AI-assisted column mapping shared by every import wizard. The mapping is
// pre-seeded to all-null before the edge function is invoked so the UI is
// usable immediately; the AI suggestion (if it lands) is sanitized — unknown
// targets are dropped and each target field can be claimed by only one source
// header. Any failure silently falls back to manual mapping.
export function useColumnMapping(targetFields) {
  const [mapping, setMapping] = useState({}) // { sourceHeader: targetField|null }
  const [mappingLoading, setMappingLoading] = useState(false)

  async function requestMapping(parsed) {
    const initial = {}
    parsed.headers.forEach(h => { initial[h] = null })
    setMapping(initial)

    setMappingLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('map-import-columns', {
        body: {
          headers: parsed.headers,
          sampleRows: parsed.rows.slice(0, 5),
          targetFields: targetFields.map(f => f.value),
        },
      })
      if (!error && data && !data.ai_failed && data.mapping) {
        const validTargets = new Set(targetFields.map(f => f.value))
        const usedTargets = new Set()
        const aiMapping = {}
        parsed.headers.forEach(h => {
          const suggested = data.mapping[h]
          if (suggested && validTargets.has(suggested) && !usedTargets.has(suggested)) {
            aiMapping[h] = suggested
            usedTargets.add(suggested)
          } else {
            aiMapping[h] = null
          }
        })
        setMapping(aiMapping)
      }
    } catch { /* fall back to manual */ }
    finally { setMappingLoading(false) }
  }

  function setMappingFor(header, target) {
    setMapping(prev => ({ ...prev, [header]: target || null }))
  }

  return { mapping, mappingLoading, requestMapping, setMappingFor }
}
