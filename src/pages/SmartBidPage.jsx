import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import { useEstimates } from '../hooks/useEstimates'
import { useMaterialOrders } from '../hooks/useMaterialOrders'
import { usePricingItems } from '../hooks/usePricingItems'
import { materialBuyQuantity } from '../utils/measurements'
import { buildSlugMap, buildOverrideMap, buildSuggestedLines } from '../lib/materialsResolve'
import { buildCatalogLookups, itemVisualProps, gradeTotal } from '../lib/materialsView'
import {
  SMART_BENCHMARK_DEFAULTS, classifyGroup, unitForMeasurementType, categoryLabel,
  matchLibraryItem, fetchRegionalBenchmarks, pickBenchmark,
} from '../lib/smartBid'
import { trackMaterials } from '../lib/analytics'
import RegionChip from '../components/smartbid/RegionChip'
import ItemVisual from '../components/materials/ItemVisual'
import { PawPrint } from 'lucide-react'
import BackLink from '../components/BackLink'
import '../components/smartbid/smartbid.css'
import { ScrollbarInside } from '../components/common/FloatingScrollbar'

const GRADES = ['premium', 'standard', 'commercial']

const card = { border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: 16 }
const input = { padding: '6px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STEP_KEYS = ['steps.measurements', 'steps.materials', 'steps.smartBid']

const heroBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '13px 26px', borderRadius: 'var(--radius-md)', border: 'none',
  background: 'linear-gradient(135deg, #F27243, #d95f33)', color: '#fff',
  fontSize: 15, fontWeight: 700, cursor: 'pointer',
}

// Three-dot progress rail: dots connected by a line, filling orange as steps
// complete, with labels beneath.
function StepRail({ step }) {
  const { t } = useTranslation()
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', maxWidth: 420, margin: '0 auto 24px' }}>
      <div style={{ position: 'absolute', top: 11, left: 12, right: 12, height: 2, background: 'var(--color-border, #d4d4d4)', zIndex: 0 }} />
      {STEP_KEYS.map((labelKey, i) => {
        const label = t(`smartbid:${labelKey}`)
        const n = i + 1
        const filled = n <= step
        return (
          <div key={label} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: filled ? '#F27243' : 'var(--color-surface)',
              color: filled ? '#fff' : 'var(--color-text-muted)',
              border: filled ? '1px solid #F27243' : '1px solid var(--color-border)',
            }}>{n}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: n === step ? 'var(--color-text, #1b2426)' : 'var(--color-text-muted)' }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function SmartBidPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId, company } = useEffectiveCompany()
  const { createEstimate, updateEstimate } = useEstimates(projectId)
  const { createOrder, updateOrder } = useMaterialOrders(projectId)
  const { items: pricingItems } = usePricingItems()

  const [zones, setZones] = useState([])
  const [catalog, setCatalog] = useState([])
  const [existingOrders, setExistingOrders] = useState([])       // prior material_orders for this project (with items)
  const [materialsMode, setMaterialsMode] = useState(null)       // null (undecided) | 'use_existing' | 'fresh'
  const [chosenOrder, setChosenOrder] = useState(null)           // the existing order being reused
  const [basketDeselected, setBasketDeselected] = useState(() => new Set())  // basket indices unchecked in fresh mode
  const modeTrackedRef = useRef(false)
  const [slugMap, setSlugMap] = useState(() => new Map())
  const [overrideMap, setOverrideMap] = useState(() => new Map())
  const [benchBySlug, setBenchBySlug] = useState(() => new Map())
  const [regionCodeUsed, setRegionCodeUsed] = useState('US')
  const [resolvedRegion, setResolvedRegion] = useState(null)
  const [usedFallback, setUsedFallback] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [step, setStep] = useState(1)
  const [excluded, setExcluded] = useState(() => new Set())   // group keys the user unchecked
  const [grade, setGrade] = useState('standard')
  const [alsoCreateOrder, setAlsoCreateOrder] = useState(true)
  const [rates, setRates] = useState({})                       // group key -> edited rate string
  const [estLaborCost, setEstLaborCost] = useState('')
  const [creating, setCreating] = useState(false)
  const [adopting, setAdopting] = useState(false)
  const [adoptNotice, setAdoptNotice] = useState(null)

  // Fire the materials-mode analytics event exactly once per wizard run.
  const fireModeTrack = useCallback((mode) => {
    if (modeTrackedRef.current) return
    modeTrackedRef.current = true
    trackMaterials('smart_bid_materials_mode', { companyId, surface: 'estimates', mode })
  }, [companyId])

  // ── Load zones, catalog, overrides, regional benchmarks ──────────────────────
  useEffect(() => {
    if (!companyId || !projectId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: sessions } = await supabase.from('sessions').select('id').eq('project_id', projectId)
        const sessionIds = (sessions || []).map(s => s.id)
        let zoneRows = []
        if (sessionIds.length > 0) {
          const { data: zr, error: zErr } = await supabase
            .from('zones').select('*').in('session_id', sessionIds).not('result', 'is', null)
          if (zErr) throw zErr
          zoneRows = zr || []
        }

        const { data: catRows, error: catErr } = await supabase
          .from('materials_catalog').select('*').eq('trade_vertical', 'painting').eq('is_active', true)
          .order('display_order', { ascending: true })
        if (catErr) throw catErr
        const { slugMap: sm } = buildSlugMap(catRows || [])

        const { data: priceRows, error: priceErr } = await supabase
          .from('company_material_prices').select('catalog_item_id, price').eq('company_id', companyId)
        if (priceErr) throw priceErr

        const { bySlug, regionCodeUsed: rcu, resolvedRegion: rr, usedFallback: uf } = await fetchRegionalBenchmarks(supabase, company?.state)

        // Prior materials lists for this project (only those with items count).
        const { data: orderRows } = await supabase
          .from('material_orders')
          .select('id, title, selected_variant, estimate_id, created_at, material_order_items(id, description, unit, quantity, coats, overage_pct, source_zone_name, product_premium, product_standard, product_commercial, cost_premium, cost_standard, cost_commercial, catalog_item_premium_id, catalog_item_standard_id, catalog_item_commercial_id)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
        const ordersWithItems = (orderRows || [])
          .map(o => ({ ...o, items: o.material_order_items || [] }))
          .filter(o => o.items.length > 0)

        if (cancelled) return
        setZones(zoneRows)
        setCatalog(catRows || [])
        setExistingOrders(ordersWithItems)
        // No prior list → go straight to the fresh basket and track it.
        if (ordersWithItems.length === 0) { setMaterialsMode('fresh'); fireModeTrack('fresh') }
        else setMaterialsMode(null)
        setSlugMap(sm)
        setOverrideMap(buildOverrideMap(priceRows))
        setBenchBySlug(bySlug)
        setRegionCodeUsed(rcu)
        setResolvedRegion(rr)
        setUsedFallback(uf)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [companyId, projectId, company?.state, fireModeTrack])

  // ── Group zones by measurement_type + surface_type ───────────────────────────
  const groups = useMemo(() => {
    const map = new Map()
    for (const z of zones) {
      const st = z.surface_type || (z.measurement_type === 'SF' ? 'Surface' : '')
      const key = `${z.measurement_type}|${st}`
      if (!map.has(key)) map.set(key, { key, measurement_type: z.measurement_type, surface_type: st, total: 0, zoneIds: [], names: new Set() })
      const g = map.get(key)
      g.total += Number(z.result) || 0
      g.zoneIds.push(z.id)
      if (z.name) g.names.add(z.name.trim())
    }
    return [...map.values()].map(g => {
      const names = [...g.names]
      const category = classifyGroup(g.measurement_type, g.surface_type, names.join(' '))
      const unit = unitForMeasurementType(g.measurement_type)
      const label = category ? categoryLabel(category) : (g.surface_type || g.measurement_type)
      const summary = names.length === 0
        ? t('smartbid:page.zonesCount', { count: g.zoneIds.length })
        : names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} ${t('smartbid:page.moreCount', { count: names.length - 2 })}`
      return { ...g, names, category, unit, label, summary, total: Math.round(g.total * 100) / 100 }
    }).sort((a, b) => a.label.localeCompare(b.label))
  }, [zones])

  const includedGroups = useMemo(() => groups.filter(g => !excluded.has(g.key)), [groups, excluded])

  // ── Materials basket (paint slugs resolved + sundries) ───────────────────────
  // ONE materials pipeline: the same resolver the builder's Quick Total/swiper/seed
  // consume. Coverage paint is resolved at suggestion time, so the wizard basket and
  // the standalone materials builder produce identical numbers for the same zones.
  const basket = useMemo(() => {
    if (!zones.length) return []
    return buildSuggestedLines({ zones, slugMap, overrideMap })
  }, [zones, slugMap, overrideMap])

  const lookups = useMemo(() => buildCatalogLookups(catalog), [catalog])

  // Fresh-mode basket minus unchecked lines. Only these persist / count.
  const selectedBasket = useMemo(
    () => basket.filter((_, i) => !basketDeselected.has(i)),
    [basket, basketDeselected]
  )

  // The lines that drive the running total & the Step 3 margin: a reused order's
  // items in use_existing mode, otherwise the checked fresh-basket lines.
  const activeLines = materialsMode === 'use_existing' && chosenOrder
    ? (chosenOrder.items || [])
    : selectedBasket

  const materialsTotal = useMemo(
    () => gradeTotal(activeLines, grade),
    [activeLines, grade]
  )

  // ── Draft lines with price hierarchy: library -> benchmark -> manual ─────────
  const draftLines = useMemo(() => {
    return includedGroups.map(g => {
      const def = g.category ? SMART_BENCHMARK_DEFAULTS[g.category] : null
      const libItem = g.category ? matchLibraryItem(pricingItems, g.category, g.unit) : null
      let priced_from = 'manual'
      let pricing_item_id = null
      let benchmark_item_id = null
      let defaultRate = null
      let low = null
      let high = null

      if (libItem) {
        priced_from = 'library'
        pricing_item_id = libItem.id
        defaultRate = Number(libItem.default_rate) || 0
        // Attach benchmark provenance for the band even on library-priced lines,
        // whenever the group maps to a benchmark scope. priced_from and the price
        // stay library; only the band/id ride along.
        if (def) {
          const bench = pickBenchmark(benchBySlug, def)
          if (bench) {
            benchmark_item_id = bench.benchmark_item_id
            low = Number(bench.local_low) || 0
            high = Number(bench.local_high) || 0
          }
        }
      } else if (def) {
        const bench = pickBenchmark(benchBySlug, def)
        if (bench) {
          priced_from = 'benchmark'
          benchmark_item_id = bench.benchmark_item_id
          defaultRate = Number(bench.local_typical) || 0
          low = Number(bench.local_low) || 0
          high = Number(bench.local_high) || 0
        }
      }

      return {
        key: g.key,
        description: g.label,
        unit: g.unit,
        quantity: g.total,
        priced_from,
        pricing_item_id,
        benchmark_item_id,
        defaultRate,
        low,
        high,
        source_zone_name: g.summary,
        source_measurement_type: g.measurement_type,
        source_zone_id: g.zoneIds.length === 1 ? g.zoneIds[0] : null,
      }
    })
  }, [includedGroups, pricingItems, benchBySlug])

  const rateFor = useCallback((line) => {
    const edited = rates[line.key]
    if (edited != null && edited !== '') return Number(edited) || 0
    if (edited === '') return 0
    return line.defaultRate != null ? Number(line.defaultRate) || 0 : 0
  }, [rates])

  const rateInputValue = (line) => {
    const edited = rates[line.key]
    if (edited != null) return edited
    return line.defaultRate != null ? String(line.defaultRate) : ''
  }

  const bidTotal = useMemo(
    () => draftLines.reduce((s, l) => s + (Number(l.quantity) || 0) * rateFor(l), 0),
    [draftLines, rateFor]
  )

  // Benchmark market band across benchmark-priced groups.
  const band = useMemo(() => {
    let low = 0, high = 0, any = false
    for (const l of draftLines) {
      if (l.priced_from === 'benchmark' && l.low != null && l.high != null) {
        any = true
        low += (Number(l.quantity) || 0) * l.low
        high += (Number(l.quantity) || 0) * l.high
      }
    }
    return { low, high, any }
  }, [draftLines])

  const bidPosition = band.any ? (bidTotal < band.low ? 'below' : bidTotal > band.high ? 'above' : 'within') : null

  const sourceMix = useMemo(() => {
    const mix = { library: 0, benchmark: 0, manual: 0 }
    for (const l of draftLines) mix[l.priced_from] = (mix[l.priced_from] || 0) + 1
    return mix
  }, [draftLines])

  function toggleGroup(key) {
    setExcluded(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  // ── Create Smart Bid ─────────────────────────────────────────────────────────
  const capGrade = (g) => (g ? t(`smartbid:page.grade.${g}`) : '')

  function useMyList() {
    const order = existingOrders[0]
    if (!order) return
    setChosenOrder(order)
    setGrade(order.selected_variant || 'standard')  // lock the running total to the saved grade
    setMaterialsMode('use_existing')
    fireModeTrack('use_existing')
  }

  function startFresh() {
    setChosenOrder(null)
    setMaterialsMode('fresh')
    fireModeTrack('fresh')
  }

  function toggleBasketLine(i) {
    setBasketDeselected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  // Deliberate, labeled action: persist each DISTINCT benchmark-priced line as a
  // pricing_items row (source='smart_bid'), skipping name+unit already in the
  // library. Does not touch the estimate, the lines, or priced_from.
  const normKey = (name, unit) => `${String(name || '').trim().toLowerCase()}|${String(unit || '').trim().toLowerCase()}`
  async function adoptMarketRates() {
    if (adopting) return
    const benchLines = draftLines.filter(l => l.priced_from === 'benchmark')
    if (benchLines.length === 0) return
    setAdopting(true)
    setAdoptNotice(null)
    try {
      // Distinct by name+unit within this run.
      const seen = new Set()
      const distinct = []
      for (const l of benchLines) {
        const k = normKey(l.description, l.unit)
        if (seen.has(k)) continue
        seen.add(k)
        distinct.push(l)
      }
      // Skip name+unit already in the contractor's library (case-insensitive).
      const existing = new Set((pricingItems || []).map(p => normKey(p.name, p.unit)))
      const toInsert = distinct.filter(l => !existing.has(normKey(l.description, l.unit)))
      if (toInsert.length === 0) { setAdoptNotice(t('smartbid:steps.savedRates', { count: 0 })); return }

      // pricing_items.category_id is NOT NULL — adopted rates always land in the
      // company's dedicated "Market Rates" category (case-insensitive), created
      // on demand when it doesn't exist yet, regardless of other categories.
      let categoryId = null
      const { data: cats, error: catSelErr } = await supabase
        .from('pricing_categories').select('id').eq('company_id', companyId)
        .ilike('name', 'Market Rates').limit(1)
      if (catSelErr) throw catSelErr
      if (cats && cats.length > 0) categoryId = cats[0].id
      else {
        const { data: newCat, error: catInsErr } = await supabase
          .from('pricing_categories').insert({ company_id: companyId, name: 'Market Rates' })
          .select('id').single()
        if (catInsErr) throw catInsErr
        categoryId = newCat.id
      }

      const rows = toInsert.map(l => ({
        company_id: companyId,
        category_id: categoryId,
        name: l.description,
        unit: l.unit,
        default_rate: Number((rateFor(l) || 0).toFixed(2)),
        source: 'smart_bid',
      }))
      const { error: insErr } = await supabase.from('pricing_items').insert(rows)
      if (insErr) throw insErr
      setAdoptNotice(t('smartbid:steps.savedRates', { count: rows.length }))
    } catch (err) {
      setAdoptNotice(err.message)
    } finally {
      setAdopting(false)
    }
  }

  async function handleCreate() {
    if (draftLines.length === 0) { setError(t('smartbid:page.errorIncludeGroup')); return }
    setCreating(true)
    setError(null)
    try {
      // 1. Estimate via the existing creation path (numbering, draft, scoping).
      const est = await createEstimate(projectId)

      // 2. Line items per the single-price convention (good columns) + provenance.
      const rows = draftLines.map((l, idx) => {
        const rate = rateFor(l)
        const qty = Number(l.quantity) || 0
        const total = qty * rate
        return {
          id: crypto.randomUUID(),
          estimate_id: est.id,
          pricing_item_id: l.pricing_item_id || null,
          description: l.description,
          category_name: '',
          unit: l.unit,
          quantity: qty,
          rate_good: rate,
          rate_better: 0,
          rate_best: 0,
          total_good: total,
          total_better: 0,
          total_best: 0,
          source_zone_id: l.source_zone_id || null,
          source_zone_name: l.source_zone_name || null,
          source_measurement_type: l.source_measurement_type || null,
          priced_from: l.priced_from || 'manual',
          benchmark_item_id: l.benchmark_item_id || null,
          sort_order: idx,
        }
      })
      const { error: liErr } = await supabase.from('estimate_line_items').insert(rows)
      if (liErr) throw liErr

      // 3. Estimate metadata + total (good only; better/best 0 per convention).
      const goodTotal = rows.reduce((s, r) => s + (Number(r.total_good) || 0), 0)
      const laborNum = estLaborCost === '' ? null : Number(estLaborCost)
      await updateEstimate(est.id, {
        smart_created: true,
        est_labor_cost: Number.isFinite(laborNum) ? laborNum : null,
        good_total: goodTotal,
        better_total: 0,
        best_total: 0,
      })

      // 4. Materials order.
      if (materialsMode === 'use_existing' && chosenOrder) {
        // Reuse the list the contractor already built: link THIS order to the new
        // estimate with a targeted update. No new order, no item writes.
        await updateOrder(chosenOrder.id, { estimate_id: est.id })
      } else if (alsoCreateOrder && selectedBasket.length > 0) {
        const order = await createOrder(projectId)
        await updateOrder(order.id, { selected_variant: grade, estimate_id: est.id, store_id: null })
        const moItems = selectedBasket.map((b, idx) => ({
          company_id: companyId,
          material_order_id: order.id,
          description: b.description || '',
          unit: b.unit || null,
          quantity: Number(b.quantity) || 0,
          coats: b.coats ?? 1,
          overage_pct: 0,
          source_zone_name: b.source_zone_name || null,
          product_premium: b.product_premium || null,
          product_standard: b.product_standard || null,
          product_commercial: b.product_commercial || null,
          cost_premium: b.cost_premium ?? null,
          cost_standard: b.cost_standard ?? null,
          cost_commercial: b.cost_commercial ?? null,
          catalog_item_premium_id: b.catalog_item_premium_id || null,
          catalog_item_standard_id: b.catalog_item_standard_id || null,
          catalog_item_commercial_id: b.catalog_item_commercial_id || null,
          ai_suggested: false,
          sort_order: idx,
        }))
        if (moItems.length > 0) {
          const { error: moErr } = await supabase.from('material_order_items').insert(moItems)
          if (moErr) throw moErr
        }
      }

      trackMaterials('smart_bid_created', {
        companyId,
        entityType: 'estimate',
        entityId: est.id,
        surface: 'estimates',
        line_count: draftLines.length,
        source_mix: sourceMix,
      })

      navigate(`/estimates/${est.id}`, { state: { smartBidCreated: true } })
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div><div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>{t('smartbid:page.loadingMeasurements')}</p>
      </div></div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <BackLink to={`/project/${projectId}`} label={t('smartbid:page.backProject')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '12px 0 16px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{t('smartbid:page.title')}</h1>
          <RegionChip
            resolvedRegion={resolvedRegion}
            usedFallback={usedFallback}
            onFallbackShown={() => trackMaterials('region_fallback_shown', { companyId, surface: 'estimates' })}
          />
        </div>
        <StepRail step={step} />

        {error && (
          <div style={{ background: 'var(--color-danger-bg, #fef2f2)', color: 'var(--color-danger, #dc2626)', border: '1px solid var(--color-danger, #dc2626)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}

        {/* ── Step 1: Measurements ── */}
        {step === 1 && (
          <div className="sb-fadein" key="step1">
            {groups.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)' }}>{t('smartbid:steps.noZones')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {groups.map(g => {
                  const included = !excluded.has(g.key)
                  return (
                    <label key={g.key} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: included ? 1 : 0.55 }}>
                      <input type="checkbox" checked={included} onChange={() => toggleGroup(g.key)} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{g.label} <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>({g.measurement_type})</span></div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{g.summary}</div>
                      </div>
                      <div style={{ fontWeight: 700 }}>{g.total} {g.unit}</div>
                    </label>
                  )
                })}
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {t('smartbid:page.scope')} {includedGroups.map(g => `${g.label} ${g.total}${g.unit}`).join(' · ') || t('smartbid:page.nothingIncluded')}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button style={primaryBtn} disabled={includedGroups.length === 0} onClick={() => setStep(2)}>{t('smartbid:steps.nextMaterials')}</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Materials ── */}
        {step === 2 && (
          <div className="sb-fadein" key="step2">

            {/* Prior list exists — let the contractor reuse it or start over. */}
            {materialsMode === null && existingOrders.length > 0 && (
              <div style={{ ...card, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('smartbid:steps.existingListTitle')}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                  {t('smartbid:steps.itemsAtGrade', { count: existingOrders[0].items.length, grade: capGrade(existingOrders[0].selected_variant || 'standard') })}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={primaryBtn} onClick={useMyList}>{t('smartbid:steps.useMyList')}</button>
                  <button style={secondaryBtn} onClick={startFresh}>{t('smartbid:steps.startFresh')}</button>
                </div>
              </div>
            )}

            {/* Use my list — the saved order, read-only. */}
            {materialsMode === 'use_existing' && chosenOrder && (
              <div style={{ ...card, marginBottom: 16 }}>
                <div style={{ overflowX: 'auto' }}><ScrollbarInside />
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
                      <th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.item')}</th><th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.unit')}</th>
                      <th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.buyQty')}</th><th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.estCost')}</th>
                    </tr></thead>
                    <tbody>
                      {chosenOrder.items.map((it, i) => (
                        <tr key={it.id || i} style={{ borderTop: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <ItemVisual {...itemVisualProps(it, lookups)} size={28} />
                              <span>{it.description}</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 8px' }}>{it.unit}</td>
                          <td style={{ padding: '6px 8px' }}>{materialBuyQuantity(it)}</td>
                          <td style={{ padding: '6px 8px' }}>{it[`cost_${grade}`] != null ? money(materialBuyQuantity(it) * Number(it[`cost_${grade}`])) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12, fontWeight: 700 }}>{t('smartbid:steps.estimatedMaterials', { grade })} {money(materialsTotal)}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>{t('smartbid:steps.editAnytime')}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>{t('smartbid:steps.pricingDisclaimer')}</div>
              </div>
            )}

            {/* Fresh from measurements — selectable basket with a live total. */}
            {materialsMode === 'fresh' && (
              <>
                <div style={{ ...card, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('smartbid:steps.gradeLabel')}</span>
                    {GRADES.map(gr => (
                      <button key={gr} onClick={() => setGrade(gr)} style={{
                        padding: '6px 14px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: grade === gr ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: grade === gr ? 'var(--color-primary)' : 'var(--color-surface)',
                        color: grade === gr ? 'var(--color-on-primary, #fff)' : 'var(--color-text, #1b2426)',
                      }}>{t(`smartbid:page.grade.${gr}`)}</button>
                    ))}
                  </div>
                  {basket.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t('smartbid:steps.noPaintMaterials')}</p>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 4px' }}>{t('smartbid:steps.checkIncluded')}</p>
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>{t('smartbid:steps.pricingDisclaimer')}</p>
                      <div style={{ overflowX: 'auto' }}><ScrollbarInside />
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
                            <th style={{ padding: '6px 8px', width: 28 }}></th><th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.item')}</th>
                            <th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.unit')}</th><th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.buyQty')}</th><th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.estCost')}</th>
                          </tr></thead>
                          <tbody>
                            {basket.map((b, i) => {
                              const on = !basketDeselected.has(i)
                              return (
                                <tr key={i} style={{ borderTop: '1px solid var(--color-border)', opacity: on ? 1 : 0.5 }}>
                                  <td style={{ padding: '6px 8px' }}><input type="checkbox" checked={on} onChange={() => toggleBasketLine(i)} /></td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <ItemVisual {...itemVisualProps(b, lookups)} size={28} />
                                      <div>
                                        <div>{b.description}</div>
                                        {b.source_zone_name && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{b.source_zone_name}</div>}
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>{b.unit}</td>
                                  <td style={{ padding: '6px 8px' }}>{materialBuyQuantity(b)}</td>
                                  <td style={{ padding: '6px 8px' }}>{b[`cost_${grade}`] != null ? money(materialBuyQuantity(b) * Number(b[`cost_${grade}`])) : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: 12, fontWeight: 700 }}>{t('smartbid:steps.estimatedMaterials', { grade })} {money(materialsTotal)}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 20 }}>
                  <input type="checkbox" checked={alsoCreateOrder} onChange={e => setAlsoCreateOrder(e.target.checked)} />
                  {t('smartbid:steps.alsoCreateOrder')}
                </label>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={secondaryBtn} onClick={() => setStep(1)}>{t('common:action.back')}</button>
              <button style={primaryBtn} disabled={materialsMode === null} onClick={() => setStep(3)}>{t('smartbid:steps.nextSmartBid')}</button>
            </div>
          </div>
        )}

        {/* ── Step 3: Smart Bid draft ── */}
        {step === 3 && (
          <div className="sb-fadein" key="step3">
            <div style={{ ...card, marginBottom: 16, overflowX: 'auto' }}><ScrollbarInside />
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
                  <th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.scope')}</th><th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.unit')}</th>
                  <th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.qty')}</th><th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.price')}</th>
                  <th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.source')}</th><th style={{ padding: '6px 8px' }}>{t('smartbid:steps.col.lineTotal')}</th>
                </tr></thead>
                <tbody>
                  {draftLines.map(l => (
                    <tr key={l.key} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px' }}>{l.description}<div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{l.source_zone_name}</div></td>
                      <td style={{ padding: '6px 8px' }}>{l.unit}</td>
                      <td style={{ padding: '6px 8px' }}>{l.quantity}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input style={{ ...input, width: 90 }} type="number" step="0.01" value={rateInputValue(l)}
                          onChange={e => setRates(prev => ({ ...prev, [l.key]: e.target.value }))} />
                        {l.priced_from === 'benchmark' && l.low != null && (
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t('smartbid:steps.bandRange', { low: money(l.low), high: money(l.high), unit: l.unit })}</div>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: l.priced_from === 'library' ? 'var(--color-primary, #26464c)' : 'var(--color-text-muted)' }}>{l.priced_from}</span>
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{money((Number(l.quantity) || 0) * rateFor(l))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Margin panel ── */}
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>{t('smartbid:steps.bidTotal')}</span><strong>{money(bidTotal)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>{t('smartbid:steps.materialsCostGrade', { grade })}</span><span>{money(materialsTotal)}</span></div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span>{t('smartbid:steps.laborCost')}</span>
                <input style={{ ...input, width: 120 }} type="number" step="0.01" placeholder={t('smartbid:steps.optional')} value={estLaborCost} onChange={e => setEstLaborCost(e.target.value)} />
              </label>
              {estLaborCost === '' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>{t('smartbid:steps.grossAfterMaterials')}</span><strong>{money(bidTotal - materialsTotal)}</strong>
                </div>
              ) : (() => {
                const labor = Number(estLaborCost) || 0
                const margin = bidTotal - materialsTotal - labor
                const pct = bidTotal > 0 ? (margin / bidTotal) * 100 : 0
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span>{t('smartbid:steps.projectedMargin')}</span><strong>{money(margin)} ({pct.toFixed(1)}%)</strong>
                  </div>
                )
              })()}
              {band.any && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
                  {t('smartbid:steps.marketRangeScope', { low: money(band.low), high: money(band.high), region: regionCodeUsed })}{' '}
                  <strong style={{ color: bidPosition === 'within' ? 'var(--color-success, #16a34a)' : 'var(--color-primary, #26464c)' }}>
                    {t('smartbid:steps.yourBidIs', { position: bidPosition })}
                  </strong>
                </div>
              )}

              {draftLines.some(l => l.priced_from === 'benchmark') && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                  <button style={{ ...secondaryBtn, opacity: adopting ? 0.6 : 1 }} onClick={adoptMarketRates} disabled={adopting}>
                    {adopting ? t('smartbid:steps.savingRates') : t('smartbid:steps.saveMarketRates')}
                  </button>
                  {adoptNotice && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>{adoptNotice}</div>}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button style={secondaryBtn} onClick={() => setStep(2)} disabled={creating}>{t('common:action.back')}</button>
              <button style={{ ...heroBtn, flex: '1 1 240px', opacity: creating ? 0.6 : 1 }} onClick={handleCreate} disabled={creating}>
                <PawPrint size={16} /> {creating ? t('smartbid:steps.creating') : t('smartbid:steps.createSmartBid')}
              </button>
            </div>
          </div>
        )}
      </div>
  )
}
