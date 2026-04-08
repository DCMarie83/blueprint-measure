import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Loads a single session plus all its zones from the database.
export function useSession(sessionId) {
  const { user } = useAuth()
  const [session, setSession] = useState(null)
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSession = useCallback(async () => {
    if (!user || !sessionId) return
    setLoading(true)

    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError) {
      setError('Session not found.')
      setLoading(false)
      return
    }

    const { data: zonesData, error: zonesError } = await supabase
      .from('zones')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (zonesError) setError(zonesError.message)
    else {
      setSession(sessionData)
      setZones(zonesData)
    }
    setLoading(false)
  }, [user, sessionId])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  async function saveZone(zoneData) {
    // zoneData: { name, measurement_type, points, result }
    const payload = {
      session_id: sessionId,
      name: zoneData.name,
      measurement_type: zoneData.measurement_type,
      points: zoneData.points,
      result: zoneData.result,
      // unit_cost and labor_rate remain null (future pricing layer)
    }

    if (zoneData.id) {
      // Update existing zone
      const { data, error } = await supabase
        .from('zones')
        .update(payload)
        .eq('id', zoneData.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      setZones(prev => prev.map(z => z.id === data.id ? data : z))
      return data
    } else {
      // Create new zone
      const { data, error } = await supabase
        .from('zones')
        .insert(payload)
        .select()
        .single()
      if (error) throw new Error(error.message)
      setZones(prev => [...prev, data])
      return data
    }
  }

  async function deleteZone(zoneId) {
    const { error } = await supabase.from('zones').delete().eq('id', zoneId)
    if (error) throw new Error(error.message)
    setZones(prev => prev.filter(z => z.id !== zoneId))
  }

  async function updateSession(updates) {
    const { data, error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    setSession(data)
    return data
  }

  return { session, zones, loading, error, saveZone, deleteZone, updateSession, refetch: fetchSession }
}
