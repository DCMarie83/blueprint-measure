import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { estimateMaterials, isCoverageLine } from '../utils/measurements'

function tempId() {
  return 'tmp_' + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
}

// Clamp coats to the DB check range (1..5). Non-coverage lines always buy at
// one coat, so their stored coats is pinned to 1 regardless of input.
function normalizeCoats(row) {
  const raw = Number(row.coats)
  const clamped = Number.isFinite(raw) ? Math.max(1, Math.min(5, Math.round(raw))) : 1
  return isCoverageLine(row) ? clamped : 1
}

// Normalize a DB row or an estimateMaterials suggestion into a local editable line.
function toLine(row, isNew = false) {
  return {
    id: row.id || tempId(),
    _new: isNew || !row.id,
    description: row.description ?? '',
    unit: row.unit ?? '',
    quantity: row.quantity ?? 0,
    coats: normalizeCoats(row),
    overage_pct: row.overage_pct ?? 0,
    source_zone_name: row.source_zone_name ?? '',
    product_premium: row.product_premium ?? '',
    product_standard: row.product_standard ?? '',
    product_commercial: row.product_commercial ?? '',
    cost_premium: row.cost_premium ?? '',
    cost_standard: row.cost_standard ?? '',
    cost_commercial: row.cost_commercial ?? '',
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
  const [stores, setStores] = useState([])
  const [estimates, setEstimates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
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

      // Active stores for the picker (is_active filter so super-admin sees the same list contractors do).
      const { data: storeRows, error: storeErr } = await supabase
        .from('stores')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (storeErr) throw storeErr
      setStores(storeRows || [])

      // Project estimates (non-fatal).
      try {
        const { data: estData } = await supabase
          .from('estimates')
          .select('*')
          .eq('project_id', ord.project_id)
          .order('created_at', { ascending: false })
        setEstimates(estData || [])
      } catch {
        setEstimates([])
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

  // Seed line items directly from the job's measured zones — no estimate needed.
  // Uses the zones already loaded by this hook. Returns { count } or { error }.
  const seedFromZones = useCallback(() => {
    if (!zones || zones.length === 0) {
      return { error: 'This job has no measured zones to build a materials list from.' }
    }
    const materials = estimateMaterials(zones, { vertical: 'paint' })
    if (materials.length === 0) {
      return { error: 'No paintable measurements found on this job.' }
    }
    setItems(materials.map((m, idx) => toLine({ ...m, sort_order: idx }, true)))
    return { count: materials.length }
  }, [zones])

  const seedFromEstimate = async (estimateId) => {
    if (!estimateId) return { error: 'No estimate selected.' }
    const { data: lineItems, error: liErr } = await supabase
      .from('estimate_line_items')
      .select('source_zone_id')
      .eq('estimate_id', estimateId)
      .not('source_zone_id', 'is', null)
    if (liErr) return { error: liErr.message }
    const zoneIds = [...new Set((lineItems || []).map((li) => li.source_zone_id))]
    if (zoneIds.length === 0) {
      return { error: 'This estimate has no measured zones to build a materials list from.' }
    }
    const scopedZones = zones.filter((z) => zoneIds.includes(z.id))
    const materials = estimateMaterials(scopedZones, { vertical: 'paint' })
    setItems(materials.map((m, idx) => toLine({ ...m, sort_order: idx }, true)))
    return { count: materials.length }
  }

  const aiSuggest = useCallback(async () => {
    if (items.length === 0) return { error: 'Add or suggest lines first.' }
    setAiSuggesting(true)
    setError(null)
    try {
      const payload = items.map(it => ({
        id: it.id,
        description: it.description || '',
        unit: it.unit || '',
        quantity: Number(it.quantity) || 0,
      }))
      const storeName = stores.find((s) => s.id === order?.store_id)?.name || null
      const { data, error: fnErr } = await supabase.functions.invoke('suggest-materials', {
        body: { lines: payload, vertical: 'paint', store: storeName },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      const fills = Array.isArray(data?.fills) ? data.fills : []
      const additions = Array.isArray(data?.additions) ? data.additions : []
      const fillMap = new Map(fills.map(f => [f.id, f]))
      setItems(prev => {
        const patched = prev.map(it => {
          const f = fillMap.get(it.id)
          if (!f) return it
          return {
            ...it,
            product_premium: f.product_premium ?? it.product_premium,
            product_standard: f.product_standard ?? it.product_standard,
            product_commercial: f.product_commercial ?? it.product_commercial,
            cost_premium: f.cost_premium ?? it.cost_premium,
            cost_standard: f.cost_standard ?? it.cost_standard,
            cost_commercial: f.cost_commercial ?? it.cost_commercial,
            ai_suggested: true,
          }
        })
        const added = additions.map(a => toLine({ ...a, ai_suggested: true }, true))
        return [...patched, ...added]
      })
      return { filled: fills.length, added: additions.length }
    } catch (err) {
      setError(err.message)
      return { error: err.message }
    } finally {
      setAiSuggesting(false)
    }
  }, [items, stores, order?.store_id])

  const saveAll = useCallback(async () => {
    if (!order) return false
    if (items.length > 0 && !order.selected_variant) {
      setError('Pick a grade (Premium / Standard / Commercial) before saving this order.')
      return false
    }
    setSaving(true)
    setError(null)
    try {
      const { error: updErr } = await supabase
        .from('material_orders')
        .update({ title: order.title ?? null, store_id: order.store_id ?? null, selected_variant: order.selected_variant ?? null, estimate_id: order.estimate_id ?? null })
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
          coats: normalizeCoats(it),
          overage_pct: num(it.overage_pct) ?? 0,
          source_zone_name: it.source_zone_name || null,
          product_premium: it.product_premium || null,
          product_standard: it.product_standard || null,
          product_commercial: it.product_commercial || null,
          cost_premium: num(it.cost_premium),
          cost_standard: num(it.cost_standard),
          cost_commercial: num(it.cost_commercial),
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
    order, items, zones, stores, estimates, loading, saving, error,
    addItem, updateItem, removeItem, updateOrderField,
    seedFromEstimate, seedFromZones, aiSuggest, aiSuggesting, saveAll, reload: load,
  }
}
