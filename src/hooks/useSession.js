import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Loads a single session plus all its zones from the database.
export function useSession(sessionId) {
  const { user, isSuperAdmin } = useAuth()
  const [session, setSession] = useState(null)
  const [zones, setZones] = useState([])
  const [enabledFeatures, setEnabledFeatures] = useState({})
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

    // The super admin always gets every feature unlocked, regardless of company flags.
    if (isSuperAdmin) {
      setEnabledFeatures({
        blueprint_measurement: true,
        multi_page_pdf:     true,
        csv_export:         true,
        redraw_zones:       true,
        paint_calculator:   true,
        ai_scale_detection: true,
        wall_calculator:    true,
        test_mode:          true,
      })
    } else {
      // Load the tenant's feature flags via two queries (split to avoid FK join blocked by RLS).
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single()
      if (profile?.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('features')
          .eq('id', profile.company_id)
          .single()
        setEnabledFeatures(company?.features ?? {})
      } else {
        setEnabledFeatures({})
      }
    }

    setLoading(false)
  }, [user, sessionId])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  async function saveZone(zoneData) {
    // zoneData: { name, description, notes, surface_type, coat_count,
    //             ceiling_type, ceiling_peak_height, ceiling_wall_height,
    //             ceiling_tray_perimeter, ceiling_drop_depth,
    //             ceiling_low_wall_height, ceiling_high_wall_height,
    //             measurement_type, points, result, page_number }
    const payload = {
      session_id: sessionId,
      name: zoneData.name,
      description: zoneData.description ?? null,
      notes: zoneData.notes ?? null,
      surface_type: zoneData.surface_type ?? null,
      coat_count: zoneData.coat_count ?? 1,
      ceiling_type: zoneData.ceiling_type ?? null,
      ceiling_peak_height:    zoneData.ceiling_peak_height    ?? null,
      ceiling_wall_height:    zoneData.ceiling_wall_height    ?? null,
      ceiling_tray_perimeter: zoneData.ceiling_tray_perimeter ?? null,
      ceiling_drop_depth:     zoneData.ceiling_drop_depth     ?? null,
      ceiling_low_wall_height:  zoneData.ceiling_low_wall_height  ?? null,
      ceiling_high_wall_height: zoneData.ceiling_high_wall_height ?? null,
      ceiling_pitch_rise:       zoneData.ceiling_pitch_rise       ?? null,
      color: zoneData.color ?? null,
      wall_height:          zoneData.wall_height          ?? null,
      opening_deductions:   zoneData.opening_deductions   ?? null,
      gross_wall_sf:        zoneData.gross_wall_sf        ?? null,
      net_wall_sf:          zoneData.net_wall_sf          ?? null,
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

  // Updates the editable fields on an existing zone.
  // Does not touch points. If updates.result is provided (e.g. after ceiling
  // param change) it will also update the stored result.
  async function updateZone(zoneId, updates) {
    const updateData = {
      name: updates.name,
      description: updates.description ?? null,
      notes: updates.notes ?? null,
      surface_type: updates.surface_type ?? null,
      coat_count: updates.coat_count ?? 1,
      surface_finish: updates.surface_finish ?? 'smooth',
      ceiling_type: updates.ceiling_type ?? null,
      ceiling_peak_height:    updates.ceiling_peak_height    ?? null,
      ceiling_wall_height:    updates.ceiling_wall_height    ?? null,
      ceiling_tray_perimeter: updates.ceiling_tray_perimeter ?? null,
      ceiling_drop_depth:     updates.ceiling_drop_depth     ?? null,
      ceiling_low_wall_height:  updates.ceiling_low_wall_height  ?? null,
      ceiling_high_wall_height: updates.ceiling_high_wall_height ?? null,
      ceiling_pitch_rise:       updates.ceiling_pitch_rise       ?? null,
      color: updates.color ?? null,
      wall_height:          updates.wall_height          ?? null,
      opening_deductions:   updates.opening_deductions   ?? null,
      gross_wall_sf:        updates.gross_wall_sf        ?? null,
      net_wall_sf:          updates.net_wall_sf          ?? null,
    }
    // Only include result when the caller explicitly provides it (ceiling/wall param edits)
    if (updates.result !== undefined) updateData.result = updates.result

    const { data, error } = await supabase
      .from('zones')
      .update(updateData)
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

  // Saves the dragged label position for a zone without touching any other fields.
  async function updateZoneLabelOffset(zoneId, offsetX, offsetY) {
    const { data, error } = await supabase
      .from('zones')
      .update({ label_offset_x: offsetX, label_offset_y: offsetY })
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

  // Re-insert a previously deleted zone with its original id.
  // Used by undo/redo to restore zones.
  async function restoreZone(zone) {
    const { id, created_at, updated_at, ...rest } = zone
    const { data, error } = await supabase
      .from('zones')
      .insert({ id, ...rest })
      .select()
      .single()
    if (error) throw new Error(error.message)
    setZones(prev => [...prev, data])
    return data
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

  return { session, zones, enabledFeatures, loading, error, saveZone, updateZone, updateZoneLabelOffset, redrawZone, deleteZone, restoreZone, updateSession, refetch: fetchSession }
}
