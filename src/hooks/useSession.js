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
    // zoneData: { name, description, notes, surface_type, coat_count, measurement_type, points, result, page_number }
    const payload = {
      session_id: sessionId,
      name: zoneData.name,
      description: zoneData.description ?? null,
      notes: zoneData.notes ?? null,
      surface_type: zoneData.surface_type ?? null,
      coat_count: zoneData.coat_count ?? 1,
      measurement_type: zoneData.measurement_type,
      points: zoneData.points,
      result: zoneData.result,
      page_number: zoneData.page_number ?? 1,
    }

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

  // Updates the editable text fields on an existing zone.
  // Does not touch points or result.
  async function updateZone(zoneId, updates) {
    const { data, error } = await supabase
      .from('zones')
      .update({
        name: updates.name,
        description: updates.description ?? null,
        notes: updates.notes ?? null,
        surface_type: updates.surface_type ?? null,
        coat_count: updates.coat_count ?? 1,
      })
      .eq('id', zoneId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    setZones(prev => prev.map(z => z.id === data.id ? data : z))
    return data
  }

  // Replaces the drawn points and recalculated result on an existing zone.
  // Called when the contractor retraces a zone. Does not touch text fields.
  async function redrawZone(zoneId, points, result) {
    const { data, error } = await supabase
      .from('zones')
      .update({ points, result })
      .eq('id', zoneId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    setZones(prev => prev.map(z => z.id === data.id ? data : z))
    return data
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

  return { session, zones, loading, error, saveZone, updateZone, redrawZone, deleteZone, updateSession, refetch: fetchSession }
}
