import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useEffectiveCompany } from './useEffectiveCompany'

/**
 * useEstimateBuilder — manages line items, zone aggregation, and totals
 * for the estimate builder page.
 */
export function useEstimateBuilder(estimateId) {
  const { companyId } = useEffectiveCompany()

  const [estimate, setEstimate] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [zones, setZones] = useState([])         // aggregated from all sessions
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const dirty = useRef(false)

  // Derive projectId from loaded estimate
  const projectId = estimate?.project_id ?? null

  // ── Fetch estimate + line items ─────────────────────────────────────────
  const fetchEstimate = useCallback(async () => {
    if (!estimateId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('estimates')
        .select('*, estimate_line_items(*)')
        .eq('id', estimateId)
        .single()
      if (err) throw err
      setEstimate(data)
      setLineItems(
        (data.estimate_line_items ?? [])
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [estimateId])

  // ── Fetch zones across all sessions and aggregate by (name, type) ───────
  const fetchZones = useCallback(async () => {
    if (!projectId) return
    try {
      const { data: sessions, error: sErr } = await supabase
        .from('sessions')
        .select('id, project_name')
        .eq('project_id', projectId)
      if (sErr) throw sErr
      if (!sessions?.length) { setZones([]); return }

      const sessionIds = sessions.map(s => s.id)
      const { data: zoneRows, error: zErr } = await supabase
        .from('zones')
        .select('*')
        .in('session_id', sessionIds)
        .not('result', 'is', null)
      if (zErr) throw zErr

      // Group by (name.trim().toLowerCase(), measurement_type)
      const groupMap = {}
      for (const z of (zoneRows ?? [])) {
        const key = `${z.name.trim().toLowerCase()}|${z.measurement_type}`
        if (!groupMap[key]) {
          groupMap[key] = {
            key,
            display_name: z.name.trim(),
            measurement_type: z.measurement_type,
            total_result: 0,
            source_count: 0,
            source_session_ids: new Set(),
          }
        }
        groupMap[key].total_result += Number(z.result) || 0
        groupMap[key].source_count += 1
        groupMap[key].source_session_ids.add(z.session_id)
      }

      // Convert Sets to arrays and sort alphabetically
      const aggregated = Object.values(groupMap)
        .map(g => ({ ...g, source_session_ids: [...g.source_session_ids] }))
        .sort((a, b) => a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase()))

      setZones(aggregated)
    } catch (err) {
      console.error('Failed to fetch zones:', err)
    }
  }, [projectId])

  useEffect(() => { fetchEstimate() }, [fetchEstimate])
  useEffect(() => { fetchZones() }, [fetchZones])

  // ── Line item mutations (local state — call saveAll to persist) ────────
  function addLineItem(item) {
    const rate = item.rate_good ?? item.rate ?? 0
    const qty = item.quantity ?? 0
    const total = item.unit === 'lump_sum' ? rate : qty * rate
    const newItem = {
      id: crypto.randomUUID(),
      estimate_id: estimateId,
      pricing_item_id: item.pricing_item_id || null,
      description: item.description || '',
      category_name: item.category_name || '',
      unit: item.unit || 'sf',
      quantity: qty,
      rate_good: rate,
      rate_better: 0,
      rate_best: 0,
      total_good: total,
      total_better: 0,
      total_best: 0,
      source_zone_id: item.source_zone_id || null,
      source_zone_name: item.source_zone_name || null,
      source_measurement_type: item.source_measurement_type || null,
      priced_from: item.priced_from ?? null,
      benchmark_item_id: item.benchmark_item_id ?? null,
      sort_order: lineItems.length,
      _isNew: true,
    }
    setLineItems(prev => [...prev, newItem])
    dirty.current = true
    return newItem
  }

  function updateLineItem(id, patch) {
    setLineItems(prev => prev.map(li => {
      if (li.id !== id) return li
      const updated = { ...li, ...patch }

      if (patch.unit === 'lump_sum' && li.unit !== 'lump_sum') {
        const seed = updated.total_good ?? 0
        updated.quantity = 1
        updated.rate_good = seed
      }

      if (updated.unit === 'lump_sum') {
        updated.quantity = 1
        updated.total_good = updated.rate_good ?? 0
      } else {
        updated.total_good = (updated.quantity ?? 0) * (updated.rate_good ?? 0)
      }
      updated.rate_better = 0
      updated.rate_best = 0
      updated.total_better = 0
      updated.total_best = 0
      return updated
    }))
    dirty.current = true
  }

  function removeLineItem(id) {
    setLineItems(prev => prev.filter(li => li.id !== id))
    dirty.current = true
  }

  // ── Computed total ──────────────────────────────────────────────────────
  const total = lineItems.reduce((sum, li) => sum + (li.total_good ?? 0), 0)

  // ── Save all line items + estimate totals ───────────────────────────────
  async function saveAll() {
    if (!estimateId) return
    setSaving(true)
    setError(null)
    try {
      // Delete existing line items, then re-insert all (simple upsert strategy)
      const { error: delErr } = await supabase
        .from('estimate_line_items')
        .delete()
        .eq('estimate_id', estimateId)
      if (delErr) throw delErr

      if (lineItems.length > 0) {
        const rows = lineItems.map((li, idx) => ({
          id: li.id,
          estimate_id: estimateId,
          pricing_item_id: li.pricing_item_id || null,
          description: li.description,
          category_name: li.category_name,
          unit: li.unit,
          quantity: li.quantity,
          rate_good: li.rate_good,
          rate_better: li.rate_better,
          rate_best: li.rate_best,
          total_good: li.total_good,
          total_better: li.total_better,
          total_best: li.total_best,
          source_zone_id: li.source_zone_id || null,
          source_zone_name: li.source_zone_name || null,
          source_measurement_type: li.source_measurement_type || null,
          priced_from: li.priced_from ?? null,
          benchmark_item_id: li.benchmark_item_id || null,
          sort_order: idx,
        }))
        const { error: insErr } = await supabase
          .from('estimate_line_items')
          .insert(rows)
        if (insErr) throw insErr
      }

      // Update estimate totals
      const { error: updErr } = await supabase
        .from('estimates')
        .update({
          good_total: total,
          better_total: 0,
          best_total: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', estimateId)
      if (updErr) throw updErr

      dirty.current = false
      // Refetch to get clean IDs
      await fetchEstimate()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  // ── Update estimate-level fields (notes, status, etc.) ──────────────────
  async function updateEstimate(patch) {
    if (!estimateId) return
    const { error: err } = await supabase
      .from('estimates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', estimateId)
    if (err) throw err
    setEstimate(prev => prev ? { ...prev, ...patch } : prev)
  }

  // ── Delete estimate ─────────────────────────────────────────────────────
  async function deleteEstimate() {
    if (!estimateId) return
    const { error: err } = await supabase.from('estimates').delete().eq('id', estimateId)
    if (err) throw err
  }

  // ── Send estimate via Edge Function ────────────────────────────────────
  async function sendEstimate(pdfBase64) {
    if (!estimateId) throw new Error('No estimate')
    const { data, error: fnErr } = await supabase.functions.invoke('send-estimate-email', {
      body: { estimate_id: estimateId, pdf_base64: pdfBase64 },
    })
    if (fnErr) throw new Error(fnErr.message || 'Send failed')
    if (data?.error) throw new Error(data.error)
    await fetchEstimate()
    return data
  }

  return {
    estimate,
    lineItems,
    zones,
    total,
    loading,
    saving,
    error,
    isDirty: dirty.current,
    addLineItem,
    updateLineItem,
    removeLineItem,
    saveAll,
    updateEstimate,
    deleteEstimate,
    sendEstimate,
    refreshZones: fetchZones,
    refetch: fetchEstimate,
  }
}
