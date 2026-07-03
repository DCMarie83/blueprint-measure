import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

const STALE_TTL = 5 * 60 * 1000 // 5 minutes

const PlatformSettingsContext = createContext({
  settings: {},
  loading: true,
  getSetting: () => undefined,
  setSetting: async () => {},
  refreshSettings: () => {},
})

export function PlatformSettingsProvider({ children }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const lastFetch = useRef(0)
  const fetching = useRef(false)

  const fetchSettings = useCallback(async () => {
    if (fetching.current) return
    fetching.current = true
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
      if (error) throw error
      const map = {}
      for (const row of (data ?? [])) {
        map[row.key] = row.value
      }
      setSettings(map)
      lastFetch.current = Date.now()
    } catch {
      // fail open — settings unavailable won't block the app
    } finally {
      setLoading(false)
      fetching.current = false
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setSettings({})
      setLoading(false)
      return
    }
    fetchSettings()
  }, [user, fetchSettings])

  const checkStale = useCallback(() => {
    if (!user) return
    if (Date.now() - lastFetch.current > STALE_TTL) {
      fetchSettings()
    }
  }, [user, fetchSettings])

  const getSetting = useCallback((key, fallback) => {
    if (key in settings) return settings[key]
    return fallback
  }, [settings])

  const setSetting = useCallback(async (key, value) => {
    const { error } = await supabase
      .from('platform_settings')
      .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw error
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  return (
    <PlatformSettingsContext.Provider value={{ settings, loading, getSetting, setSetting, refreshSettings: fetchSettings, checkStale }}>
      {children}
    </PlatformSettingsContext.Provider>
  )
}

export function usePlatformSettings() {
  const ctx = useContext(PlatformSettingsContext)
  ctx.checkStale()
  return { settings: ctx.settings, loading: ctx.loading, getSetting: ctx.getSetting, setSetting: ctx.setSetting, refreshSettings: ctx.refreshSettings }
}
