import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { estimateMaterials, isCoverageLine } from '../utils/measurements'
import { humanizeSlug, resolveSlug, buildSlugMap, buildOverrideMap, computeSundryLines } from '../lib/materialsResolve'

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

// Normalize a DB row or a suggestion into a local editable line. Carries the
// catalog provenance ids and the (local-only) taxonomy_slug for dedup.
function toLine(row, isNew = false) {
  return {
    id: row.id || tempId(),
    _new: isNew || !row.id,
    taxonomy_slug: row.taxonomy_slug ?? null,
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
    catalog_item_premium_id: row.catalog_item_premium_id ?? null,
    catalog_item_standard_id: row.catalog_item_standard_id ?? null,
    catalog_item_commercial_id: row.catalog_item_commercial_id ?? null,
    ai_suggested: !!row.ai_suggested,
  }
}

const num = (v) => (v === '' || v == null ? null : Number(v))

// Single material order + its line items + the job's zones (for "Suggest") +
// the painting catalog and this company's price overrides (for resolution).
export function useMaterialOrderBuilder(orderId) {
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [zones, setZones] = useState([])
  const [stores, setStores] = useState([])
  const [estimates, setEstimates] = useState([])
  const [catalog, setCatalog] = useState([])
  const [slugMap, setSlugMap] = useState(() => new Map())
  const [overrideMap, setOverrideMap] = useState(() => new Map())
  const [storeNameById, setStoreNameById] = useState(() => new Map())
  const [maxPriceAsOf, setMaxPriceAsOf] = useState(null)
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
      setStoreNameById(new Map((storeRows || []).map(s => [s.id, s.name])))

      // Painting catalog (active) -> slug -> grade rows map + max price_as_of.
      const { data: catRows, error: catErr } = await supabase
        .from('materials_catalog')
        .select('*')
        .eq('trade_vertical', 'painting')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      if (catErr) throw catErr
      const catList = catRows || []
      setCatalog(catList)
      const { slugMap: sm, maxPriceAsOf: maxAsOf } = buildSlugMap(catList)
      setSlugMap(sm)
      setMaxPriceAsOf(maxAsOf)

      // This company's price overrides, keyed by catalog_item_id.
      const { data: priceRows, error: priceErr } = await supabase
        .from('company_material_prices')
        .select('catalog_item_id, price')
        .eq('company_id', ord.company_id)
      if (priceErr) throw priceErr
      setOverrideMap(buildOverrideMap(priceRows))

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
  // Builds the paint (coverage) lines, then appends deterministic sundries from
  // the catalog (per_area / per_job rules), resolving products/costs/provenance.
  const seedFromZones = useCallback(() => {
    if (!zones || zones.length === 0) {
      return { error: 'This job has no measured zones to build a materials list from.' }
    }
    const paintLines = estimateMaterials(zones, { vertical: 'paint' })
    if (paintLines.length === 0) {
      return { error: 'No paintable measurements found on this job.' }
    }

    const lines = paintLines.map((m, idx) => ({ ...m, sort_order: idx }))
    const sundries = computeSundryLines({ zones, slugMap, overrideMap, existingLines: lines })
    for (const s of sundries) lines.push({ ...s, sort_order: lines.length })

    setItems(lines.map((m, idx) => toLine({ ...m, sort_order: idx }, true)))
    return { count: paintLines.length, sundries: sundries.length }
  }, [zones, slugMap, overrideMap])

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

  // AI mapper: send the compact active catalog + lines, resolve the returned
  // taxonomy_slugs client-side into products/costs/provenance. The model never
  // returns prices or product names.
  const aiSuggest = useCallback(async () => {
    if (items.length === 0) return { error: 'Add or suggest lines first.' }
    if (catalog.length === 0) return { error: 'The materials catalog is empty — nothing to map against.' }
    setAiSuggesting(true)
    setError(null)
    try {
      const linePayload = items.map(it => ({
        id: it.id,
        description: it.description || '',
        unit: it.unit || '',
        quantity: Number(it.quantity) || 0,
      }))
      const storeName = storeNameById.get(order?.store_id) || null
      const compactCatalog = catalog.map(r => ({
        taxonomy_slug: r.taxonomy_slug,
        name: r.name,
        grade: r.grade,
        store_name: storeNameById.get(r.store_id) || null,
        purchase_unit: r.purchase_unit,
      }))
      const { data, error: fnErr } = await supabase.functions.invoke('suggest-materials', {
        body: { lines: linePayload, store_name: storeName, vertical: 'paint', catalog: compactCatalog },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)

      const fills = Array.isArray(data?.fills) ? data.fills : []
      const additions = Array.isArray(data?.additions) ? data.additions : []
      const notInCatalog = Array.isArray(data?.not_in_catalog) ? data.not_in_catalog : []
      const fillMap = new Map(fills.map(f => [f.id, f]))

      let mapped = 0
      const resolvedAdditions = []
      for (const a of additions) {
        if (!a?.taxonomy_slug) continue
        const resolved = resolveSlug(a.taxonomy_slug, slugMap, overrideMap)
        if (!resolved) continue
        const dr = resolved.displayRow
        resolvedAdditions.push(toLine({
          taxonomy_slug: a.taxonomy_slug,
          description: humanizeSlug(a.taxonomy_slug),
          unit: dr?.purchase_unit || '',
          quantity: Number(a.quantity) || 1,
          coats: 1,
          ai_suggested: true,
          ...resolved.fields,
        }, true))
      }
      const missingLines = notInCatalog.map(n => toLine({
        description: n?.description || '',
        unit: n?.unit || '',
        quantity: Number(n?.quantity) || 1,
        coats: 1,
        ai_suggested: true,
      }, true))

      setItems(prev => {
        const patched = prev.map(it => {
          const f = fillMap.get(it.id)
          if (!f || !f.taxonomy_slug) return it
          const resolved = resolveSlug(f.taxonomy_slug, slugMap, overrideMap)
          if (!resolved) return it
          mapped++
          return { ...it, taxonomy_slug: f.taxonomy_slug, ...resolved.fields, ai_suggested: true }
        })
        return [...patched, ...resolvedAdditions, ...missingLines]
      })

      return { mapped, additions: resolvedAdditions.length, notInCatalog: missingLines.length }
    } catch (err) {
      setError(err.message)
      return { error: err.message }
    } finally {
      setAiSuggesting(false)
    }
  }, [items, catalog, slugMap, overrideMap, storeNameById, order?.store_id])

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
          catalog_item_premium_id: it.catalog_item_premium_id || null,
          catalog_item_standard_id: it.catalog_item_standard_id || null,
          catalog_item_commercial_id: it.catalog_item_commercial_id || null,
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
    order, items, zones, stores, estimates, catalog, overrideMap, maxPriceAsOf, loading, saving, error,
    addItem, updateItem, removeItem, updateOrderField,
    seedFromEstimate, seedFromZones, aiSuggest, aiSuggesting, saveAll, reload: load,
  }
}
