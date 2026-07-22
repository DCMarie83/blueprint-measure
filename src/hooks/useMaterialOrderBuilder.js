import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { estimateMaterials, isCoverageLine } from '../utils/measurements'
import { humanizeSlug, resolveSlug, buildSlugMap, buildOverrideMap, computeSundryLines, buildSuggestedLines } from '../lib/materialsResolve'

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
  const [loadWarnings, setLoadWarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!orderId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    setLoadWarnings([])

    // ── FATAL: the order and its items ARE the page. If this fails, stop. ──
    let ord
    try {
      const { data, error: ordErr } = await supabase
        .from('material_orders')
        .select('*, material_order_items(*)')
        .eq('id', orderId)
        .single()
      if (ordErr) throw ordErr
      ord = data
      setOrder(ord)
      const sorted = (ord.material_order_items || [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(r => toLine(r))
      setItems(sorted)
    } catch (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    // ── NON-FATAL: each secondary fetch is individually guarded (sequential
    //    with per-fetch guards — each depends only on `ord`, and catalog must
    //    build slugMap in order). One failure never blocks the others; each
    //    reads its own error field, warns, sets a safe default, and appends a
    //    human string to warnings. ──
    const warnings = []

    // Job zones: sessions for this project -> zones with a result.
    try {
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
      console.warn('[materials] zones load failed:', err?.message || err)
      setZones([])
      warnings.push("Couldn't load this job's measurements.")
    }

    // Active stores for the picker.
    try {
      const { data: storeRows, error: storeErr } = await supabase
        .from('stores')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (storeErr) throw storeErr
      setStores(storeRows || [])
      setStoreNameById(new Map((storeRows || []).map(s => [s.id, s.name])))
    } catch (err) {
      console.warn('[materials] stores load failed:', err?.message || err)
      setStores([])
      setStoreNameById(new Map())
      warnings.push("Couldn't load stores.")
    }

    // Painting catalog (active) -> slug -> grade rows map + max price_as_of.
    try {
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
    } catch (err) {
      console.warn('[materials] catalog load failed:', err?.message || err)
      setCatalog([])
      setSlugMap(new Map())
      setMaxPriceAsOf(null)
      warnings.push("Couldn't load the materials catalog.")
    }

    // This company's price overrides, keyed by catalog_item_id.
    try {
      const { data: priceRows, error: priceErr } = await supabase
        .from('company_material_prices')
        .select('catalog_item_id, price')
        .eq('company_id', ord.company_id)
      if (priceErr) throw priceErr
      setOverrideMap(buildOverrideMap(priceRows))
    } catch (err) {
      console.warn('[materials] price overrides load failed:', err?.message || err)
      setOverrideMap(new Map())
      warnings.push("Couldn't load your saved prices.")
    }

    // Project estimates (reads its OWN error field now, not just data).
    try {
      const { data: estData, error: estErr } = await supabase
        .from('estimates')
        .select('*')
        .eq('project_id', ord.project_id)
        .order('created_at', { ascending: false })
      if (estErr) throw estErr
      let list = estData || []

      // C5: a DB-linked estimate must always render selected. If the order's
      // estimate_id isn't in the project list, fetch that one estimate and
      // prepend it; on failure, prepend an "unavailable" sentinel the picker
      // renders as a disabled option.
      if (ord.estimate_id && !list.some(e => e.id === ord.estimate_id)) {
        try {
          const { data: linked, error: linkedErr } = await supabase
            .from('estimates')
            .select('*')
            .eq('id', ord.estimate_id)
            .single()
          if (linkedErr) throw linkedErr
          if (linked) list = [linked, ...list]
        } catch (err2) {
          console.warn('[materials] linked estimate fetch failed:', err2?.message || err2)
          list = [{ id: ord.estimate_id, __unavailable: true }, ...list]
        }
      }
      setEstimates(list)
    } catch (err) {
      console.warn('[materials] estimates load failed:', err?.message || err)
      setEstimates([])
      warnings.push("Couldn't load estimates for this job.")
    }

    setLoadWarnings(warnings)
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load])

  const addItem = useCallback((partial = {}) => {
    setItems(prev => [...prev, toLine(partial, true)])
  }, [])

  // Replace the local editable items wholesale (e.g. the swiper's kept set landing
  // on the table before Save). Normalizes through toLine.
  const replaceItems = useCallback((lines) => {
    setItems((lines || []).map((m, idx) => toLine({ ...m, sort_order: idx }, true)))
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

  // Persist estimate_id immediately with a targeted id-scoped update so the link
  // survives navigating away before Save. Local state is updated by the caller;
  // returns { error } on failure so the caller can surface it. (store_id stays
  // Save-gated this pass.)
  const persistEstimateId = useCallback(async (estimateId) => {
    const id = order?.id
    if (!id) return { error: 'No order loaded.' }
    const { error: err } = await supabase
      .from('material_orders')
      .update({ estimate_id: estimateId ?? null })
      .eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [order?.id])

  // In-memory suggested lines (toLine-normalized), no persistence. Consumed by
  // Quick Total and the swiper's new-order mode.
  const buildSuggested = useCallback(() => {
    return buildSuggestedLines({ zones, slugMap, overrideMap }).map((m, idx) => toLine({ ...m, sort_order: idx }, true))
  }, [zones, slugMap, overrideMap])

  // Shared seeding: build the suggested lines for a zone list and set them as the
  // order's items. Returns { paint, sundries, total }.
  const seedZonesInto = useCallback((zoneList) => {
    const lines = buildSuggestedLines({ zones: zoneList, slugMap, overrideMap })
    const sundries = lines.filter(l => l.taxonomy_slug).length
    const paint = lines.length - sundries
    setItems(lines.map((m, idx) => toLine({ ...m, sort_order: idx }, true)))
    return { paint, sundries, total: lines.length }
  }, [slugMap, overrideMap])

  // Seed line items directly from the job's measured zones — no estimate needed.
  const seedFromZones = useCallback(() => {
    if (!zones || zones.length === 0) {
      return { error: 'This job has no measured zones to build a materials list from.' }
    }
    const paintLines = estimateMaterials(zones, { vertical: 'paint' })
    if (paintLines.length === 0) {
      return { error: 'No paintable measurements found on this job.' }
    }
    const r = seedZonesInto(zones)
    return { count: r.paint, sundries: r.sundries }
  }, [zones, seedZonesInto])

  const seedFromEstimate = async (estimateId) => {
    if (!estimateId) return { error: 'No estimate selected.' }
    const { data: lineItems, error: liErr } = await supabase
      .from('estimate_line_items')
      .select('source_zone_id')
      .eq('estimate_id', estimateId)
      .not('source_zone_id', 'is', null)
    if (liErr) return { error: liErr.message }
    const zoneIds = [...new Set((lineItems || []).map((li) => li.source_zone_id))]

    // Primary path: the estimate's lines carry source_zone_id — seed from those.
    if (zoneIds.length > 0) {
      const scopedZones = zones.filter((z) => zoneIds.includes(z.id))
      const r = seedZonesInto(scopedZones)
      return { count: r.paint }
    }

    // C2 fallback: Smart Bid estimates group multiple zones per line, so their
    // lines carry source_zone_id null. The estimate belongs to THIS job, so seed
    // from all of the order's measured zones through the same path.
    if (!zones || zones.length === 0) {
      return { error: 'This estimate has no measured zones to build a materials list from.' }
    }
    const paintLines = estimateMaterials(zones, { vertical: 'paint' })
    if (paintLines.length === 0) {
      return { error: 'This estimate has no measured zones to build a materials list from.' }
    }
    const r = seedZonesInto(zones)
    return { count: r.total, fallback: true }
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

  // Persist an explicit set of lines with a grade (and optional estimate link)
  // through the existing delete-then-reinsert path. Used by the table Save
  // (saveAll), Quick Total, and the swiper. opts: { grade, estimateId }.
  const saveLines = useCallback(async (lines, opts = {}) => {
    if (!order) return false
    const list = lines || []
    const variant = opts.grade ?? order.selected_variant
    if (list.length > 0 && !variant) {
      setError('Pick a grade (Premium / Standard / Commercial) before saving this order.')
      return false
    }
    setSaving(true)
    setError(null)
    try {
      const patch = {
        title: order.title ?? null,
        store_id: order.store_id ?? null,
        selected_variant: variant ?? null,
        estimate_id: (opts.estimateId !== undefined) ? (opts.estimateId ?? null) : (order.estimate_id ?? null),
      }
      const { error: updErr } = await supabase.from('material_orders').update(patch).eq('id', order.id)
      if (updErr) throw updErr

      const { error: delErr } = await supabase
        .from('material_order_items')
        .delete()
        .eq('material_order_id', order.id)
      if (delErr) throw delErr

      if (list.length > 0) {
        const rows = list.map((it, idx) => ({
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
        const { error: insErr } = await supabase.from('material_order_items').insert(rows)
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
  }, [order, load])

  const saveAll = useCallback(() => saveLines(items), [saveLines, items])

  return {
    order, items, zones, stores, estimates, catalog, overrideMap, maxPriceAsOf, storeNameById, loadWarnings, loading, saving, error,
    addItem, replaceItems, updateItem, removeItem, updateOrderField, persistEstimateId,
    seedFromEstimate, seedFromZones, buildSuggested, saveLines, aiSuggest, aiSuggesting, saveAll, reload: load,
  }
}
