import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import { useEstimates } from '../hooks/useEstimates'
import { useMaterialOrders } from '../hooks/useMaterialOrders'
import { usePricingItems } from '../hooks/usePricingItems'
import { estimateMaterials, materialBuyQuantity } from '../utils/measurements'
import { buildSlugMap, buildOverrideMap, resolveSlug, computeSundryLines } from '../lib/materialsResolve'
import {
  SMART_BENCHMARK_DEFAULTS, classifyGroup, unitForMeasurementType, categoryLabel,
  matchLibraryItem, fetchRegionalBenchmarks, pickBenchmark,
} from '../lib/smartBid'
import { trackMaterials } from '../lib/analytics'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'

const GRADES = ['premium', 'standard', 'commercial']

const card = { border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: 16 }
const input = { padding: '6px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)', boxSizing: 'border-box' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STEPS = ['Measurements', 'Materials', 'Smart Bid']

function StepHeader({ step }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      {STEPS.map((label, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 9999,
            fontSize: 13, fontWeight: 600,
            background: active ? 'var(--color-primary)' : done ? 'var(--color-surface-2)' : 'var(--color-surface)',
            color: active ? 'var(--color-on-primary, #fff)' : 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
          }}>
            <span>{n}</span><span>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function SmartBidPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { companyId, company } = useEffectiveCompany()
  const { createEstimate, updateEstimate } = useEstimates(projectId)
  const { createOrder, updateOrder } = useMaterialOrders(projectId)
  const { items: pricingItems } = usePricingItems()

  const [zones, setZones] = useState([])
  const [slugMap, setSlugMap] = useState(() => new Map())
  const [overrideMap, setOverrideMap] = useState(() => new Map())
  const [benchBySlug, setBenchBySlug] = useState(() => new Map())
  const [regionCodeUsed, setRegionCodeUsed] = useState('US')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [step, setStep] = useState(1)
  const [excluded, setExcluded] = useState(() => new Set())   // group keys the user unchecked
  const [grade, setGrade] = useState('standard')
  const [alsoCreateOrder, setAlsoCreateOrder] = useState(true)
  const [rates, setRates] = useState({})                       // group key -> edited rate string
  const [estLaborCost, setEstLaborCost] = useState('')
  const [creating, setCreating] = useState(false)

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

        const { bySlug, regionCodeUsed: rcu } = await fetchRegionalBenchmarks(supabase, company?.state)

        if (cancelled) return
        setZones(zoneRows)
        setSlugMap(sm)
        setOverrideMap(buildOverrideMap(priceRows))
        setBenchBySlug(bySlug)
        setRegionCodeUsed(rcu)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [companyId, projectId, company?.state])

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
        ? `${g.zoneIds.length} zone${g.zoneIds.length === 1 ? '' : 's'}`
        : names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
      return { ...g, names, category, unit, label, summary, total: Math.round(g.total * 100) / 100 }
    }).sort((a, b) => a.label.localeCompare(b.label))
  }, [zones])

  const includedGroups = useMemo(() => groups.filter(g => !excluded.has(g.key)), [groups, excluded])

  // ── Materials basket (paint slugs resolved + sundries) ───────────────────────
  const basket = useMemo(() => {
    if (!zones.length) return []
    const paint = estimateMaterials(zones, { vertical: 'paint' }).map(l => {
      const slug = /ceiling/i.test(l.description || '') ? 'paint-ceiling-interior' : 'paint-wall-interior'
      const resolved = resolveSlug(slug, slugMap, overrideMap)
      return { ...l, taxonomy_slug: slug, ...(resolved?.fields || {}) }
    })
    const sundries = computeSundryLines({ zones, slugMap, overrideMap, existingLines: paint })
    return [...paint, ...sundries]
  }, [zones, slugMap, overrideMap])

  const materialsTotal = useMemo(
    () => basket.reduce((s, b) => s + materialBuyQuantity(b) * (Number(b[`cost_${grade}`]) || 0), 0),
    [basket, grade]
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
  async function handleCreate() {
    if (draftLines.length === 0) { setError('Include at least one measurement group.'); return }
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

      // 4. Optional linked materials order (existing create + update paths).
      if (alsoCreateOrder && basket.length > 0) {
        const order = await createOrder(projectId)
        await updateOrder(order.id, { selected_variant: grade, estimate_id: est.id, store_id: null })
        const moItems = basket.map((b, idx) => ({
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

      navigate(`/estimates/${est.id}`)
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div><AppHeader /><div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading measurements…</p>
      </div></div>
    )
  }

  return (
    <div>
      <AppHeader />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
        <BackLink to={`/project/${projectId}`} label="project" />
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '12px 0 16px' }}>Smart Bid</h1>
        <StepHeader step={step} />

        {error && (
          <div style={{ background: 'var(--color-danger-bg, #fef2f2)', color: 'var(--color-danger, #dc2626)', border: '1px solid var(--color-danger, #dc2626)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}

        {/* ── Step 1: Measurements ── */}
        {step === 1 && (
          <div>
            {groups.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)' }}>No measured zones on this job. Measure it first, then start a Smart Bid.</p>
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
                  Scope: {includedGroups.map(g => `${g.label} ${g.total}${g.unit}`).join(' · ') || 'nothing included'}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button style={primaryBtn} disabled={includedGroups.length === 0} onClick={() => setStep(2)}>Next: Materials</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Materials ── */}
        {step === 2 && (
          <div>
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Grade:</span>
                {GRADES.map(gr => (
                  <button key={gr} onClick={() => setGrade(gr)} style={{
                    padding: '6px 14px', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: grade === gr ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: grade === gr ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: grade === gr ? 'var(--color-on-primary, #fff)' : 'var(--color-text, #1b2426)',
                  }}>{gr.charAt(0).toUpperCase() + gr.slice(1)}</button>
                ))}
              </div>
              {basket.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No paint materials computed from these measurements.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
                      <th style={{ padding: '6px 8px' }}>Item</th><th style={{ padding: '6px 8px' }}>Unit</th>
                      <th style={{ padding: '6px 8px' }}>Buy qty</th><th style={{ padding: '6px 8px' }}>Est. cost</th>
                    </tr></thead>
                    <tbody>
                      {basket.map((b, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '6px 8px' }}>{b.description}</td>
                          <td style={{ padding: '6px 8px' }}>{b.unit}</td>
                          <td style={{ padding: '6px 8px' }}>{materialBuyQuantity(b)}</td>
                          <td style={{ padding: '6px 8px' }}>{b[`cost_${grade}`] != null ? money(materialBuyQuantity(b) * Number(b[`cost_${grade}`])) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ marginTop: 12, fontWeight: 700 }}>Estimated materials ({grade}): {money(materialsTotal)}</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 20 }}>
              <input type="checkbox" checked={alsoCreateOrder} onChange={e => setAlsoCreateOrder(e.target.checked)} />
              Also create the materials order for this job
            </label>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={secondaryBtn} onClick={() => setStep(1)}>Back</button>
              <button style={primaryBtn} onClick={() => setStep(3)}>Next: Smart Bid</button>
            </div>
          </div>
        )}

        {/* ── Step 3: Smart Bid draft ── */}
        {step === 3 && (
          <div>
            <div style={{ ...card, marginBottom: 16, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
                  <th style={{ padding: '6px 8px' }}>Scope</th><th style={{ padding: '6px 8px' }}>Unit</th>
                  <th style={{ padding: '6px 8px' }}>Qty</th><th style={{ padding: '6px 8px' }}>Price</th>
                  <th style={{ padding: '6px 8px' }}>Source</th><th style={{ padding: '6px 8px' }}>Line total</th>
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
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>band {money(l.low)}–{money(l.high)}/{l.unit}</div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>Bid total</span><strong>{money(bidTotal)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>Materials cost ({grade})</span><span>{money(materialsTotal)}</span></div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span>Your estimated labor cost</span>
                <input style={{ ...input, width: 120 }} type="number" step="0.01" placeholder="optional" value={estLaborCost} onChange={e => setEstLaborCost(e.target.value)} />
              </label>
              {estLaborCost === '' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>Gross after materials</span><strong>{money(bidTotal - materialsTotal)}</strong>
                </div>
              ) : (() => {
                const labor = Number(estLaborCost) || 0
                const margin = bidTotal - materialsTotal - labor
                const pct = bidTotal > 0 ? (margin / bidTotal) * 100 : 0
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span>Projected margin</span><strong>{money(margin)} ({pct.toFixed(1)}%)</strong>
                  </div>
                )
              })()}
              {band.any && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
                  Market range for this scope: {money(band.low)} to {money(band.high)} ({regionCodeUsed}).{' '}
                  <strong style={{ color: bidPosition === 'within' ? 'var(--color-success, #16a34a)' : 'var(--color-primary, #26464c)' }}>
                    Your bid is {bidPosition}.
                  </strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button style={secondaryBtn} onClick={() => setStep(2)} disabled={creating}>Back</button>
              <button style={{ ...primaryBtn, opacity: creating ? 0.6 : 1 }} onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create Smart Bid'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
