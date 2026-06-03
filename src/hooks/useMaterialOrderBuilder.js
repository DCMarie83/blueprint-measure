import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { estimateMaterials } from '../utils/measurements'

function tempId() {
  return 'tmp_' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
}

// Normalize a DB row or an estimateMaterials suggestion into a local editable line.
function toLine(row, isNew = false) {
  return {
    id: row.id || tempId(),
    _new: isNew || !row.id,
    description: row.description ?? '',
    unit: row.unit ?? '',
    quantity: row.quantity ?? 0,
    overage_pct: row.overage_pct ?? 0,
    source_zone_name: row.source_zone_name ?? '',
    product_good: row.product_good ?? '',
    product_better: row.product_better ?? '',
    product_best: row.product_best ?? '',
    cost_good: row.cost_good ?? '',
    cost_better: row.cost_better ?? '',
    cost_best: row.cost_best ?? '',
    ai_suggested: !!row.ai_suggested,
  }
}

const num = (v) => (v === '' || v == null ? null : Number(v))

// Single material order + its line items + the job's zones (for "Suggest").
// Mirrors useEstimateBuilder: local-state line items, delete-then-reinsert save.
export function useMaterialOrderBuilder(orderId) {
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!orderId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data: ord, error: ordErr } = await supabase
        .from('material_orders')
        .select('*, material_order_items(*)')
        .eq('id', orderId)
        .single()
      if (ordErr) throw ordErr
      setOrder(ord)
      const sorted = (ord.material_order_items || [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(r => toLine(r))
      setItems(sorted)

      // Job zones: sessions for this project -> zones with a result.
      const { data: sessions, error: sessErr } = await supabase
        .from('sessions')
        .select('id')
        .eq('project_id', ord.project_id)
      if (sessErr) throw sessErr
      const sessionIds = (sessions || []).map(s => s.id)
      if (sessionIds.length > 0) {
        const { data: zoneRows, error: zoneErr } = await supabase
          .from('zones')
          .select('*')
          .in('session_id', sessionIds)
          .not('result', 'is', null)
        if (zoneErr) throw zoneErr
        setZones(zoneRows || [])
      } else {
        setZones([])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { load() }, [load])

  const addItem = useCallback((partial = {}) => {
    setItems(prev => [...prev, toLine(partial, true)])
  }, [])

  const updateItem = useCallback((id, patch) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

  const removeItem = useCallback((id) => {
    setItems(prev => prev.filter(it => it.id !== id))
  }, [])

  const updateOrderField = useCallback((patch) => {
    setOrder(prev => (prev ? { ...prev, ...patch } : prev))
  }, [])

  // Non-destructive: appends suggested lines to whatever's already there.
  const suggestFromMeasurements = useCallback(() => {
    const suggestions = estimateMaterials(zones, { vertical: 'paint', defaultOverage: 0 })
    if (suggestions.length === 0) return 0
    setItems(prev => [...prev, ...suggestions.map(s => toLine(s, true))])
    return suggestions.length
  }, [zones])

  const saveAll = useCallback(async () => {
    if (!order) return false
    setSaving(true)
    setError(null)
    try {
      const { error: updErr } = await supabase
        .from('material_orders')
        .update({ title: order.title ?? null })
        .eq('id', order.id)
      if (updErr) throw updErr

      const { error: delErr } = await supabase
        .from('material_order_items')
        .delete()
        .eq('material_order_id', order.id)
      if (delErr) throw delErr

      if (items.length > 0) {
        const rows = items.map((it, idx) => ({
          company_id: order.company_id,
          material_order_id: order.id,
          description: it.description || '',
          unit: it.unit || null,
          quantity: num(it.quantity) ?? 0,
          overage_pct: num(it.overage_pct) ?? 0,
          source_zone_name: it.source_zone_name || null,
          product_good: it.product_good || null,
          product_better: it.product_better || null,
          product_best: it.product_best || null,
          cost_good: num(it.cost_good),
          cost_better: num(it.cost_better),
          cost_best: num(it.cost_best),
          ai_suggested: !!it.ai_suggested,
          sort_order: idx,
        }))
        const { error: insErr } = await supabase
          .from('material_order_items')
          .insert(rows)
        if (insErr) throw insErr
      }

      await load()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }, [order, items, load])

  return {
    order, items, zones, loading, saving, error,
    addItem, updateItem, removeItem, updateOrderField,
    suggestFromMeasurements, saveAll, reload: load,
  }
}
