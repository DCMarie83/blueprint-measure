import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Save, Trash2, Plus, Package, Download, Send, FileText, Check } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import ZoneAggregationPanel from '../components/estimates/ZoneAggregationPanel'
import PricingItemPicker from '../components/estimates/PricingItemPicker'
import LineItemsTable from '../components/estimates/LineItemsTable'
import SendEstimateModal from '../components/estimates/SendEstimateModal'
import { useEstimateBuilder } from '../hooks/useEstimateBuilder'
import { usePricingCategories } from '../hooks/usePricingCategories'
import { usePricingItems } from '../hooks/usePricingItems'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { generateEstimatePDF } from '../lib/generateEstimatePDF'
import { calculateDepositPercent, getReferenceTotal } from '../lib/depositMath'
import { getDisplayTotal } from '../lib/estimateDisplay'
import { isSmartEstimate, fetchBenchmarksByItemIds } from '../lib/smartBid'
import { materialBuyQuantity } from '../utils/measurements'
import { trackMaterials } from '../lib/analytics'
import SmartBadge from '../components/smartbid/SmartBadge'
import MarketBand from '../components/smartbid/MarketBand'
import styles from './EstimateDetailPage.module.css'

// Display-only number tween (~500ms, cubic ease-out). Snaps under reduced motion.
// Stored values are written once through the normal update path; this only eases
// the on-screen figure.
function useAnimatedNumber(value, duration = 500) {
  const [display, setDisplay] = useState(Number(value) || 0)
  const fromRef = useRef(Number(value) || 0)
  const rafRef = useRef(null)
  useEffect(() => {
    const target = Number(value) || 0
    const from = Number(fromRef.current) || 0
    if (from === target) { setDisplay(target); return }
    const reduce = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { fromRef.current = target; setDisplay(target); return }
    let start = null
    const step = (ts) => {
      if (start == null) start = ts
      const p = Math.min(1, (ts - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (target - from) * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
      else fromRef.current = target
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])
  return display
}

const STATUS_OPTIONS = ['draft', 'sent', 'accepted', 'declined', 'expired', 'changes_requested']

const STATUS_CLASS = {
  draft: styles.statusDraft,
  sent: styles.statusSent,
  accepted: styles.statusAccepted,
  declined: styles.statusDeclined,
  expired: styles.statusExpired,
}

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function EstimateDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, userProfile, isSuperAdmin } = useAuth()
  const isAdmin = userProfile?.role === 'contractor_admin' || isSuperAdmin

  const builder = useEstimateBuilder(id)

  const { categories } = usePricingCategories()
  const { items: pricingItems } = usePricingItems()

  const [showPicker, setShowPicker] = useState(false)
  const [pickerZone, setPickerZone] = useState(null)
  const [notesValue, setNotesValue] = useState(null)
  const [saveMsg, setSaveMsg] = useState(null)
  const [titleValue, setTitleValue] = useState(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [termsValue, setTermsValue] = useState(null)
  const [depositValue, setDepositValue] = useState(null)
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false)
  const pdfMenuRef = useRef(null)

  // Smart Bid layer state
  const [benchmarkMap, setBenchmarkMap] = useState(() => new Map())
  const [benchLoading, setBenchLoading] = useState(false)
  const [materials, setMaterials] = useState({ cost: null, linked: false })
  const [laborValue, setLaborValue] = useState(null)
  const [customMult, setCustomMult] = useState('1.00')
  const [includeLibraryInCustom, setIncludeLibraryInCustom] = useState(false)
  const [lastScenario, setLastScenario] = useState(null)
  const [pulseIds, setPulseIds] = useState(() => new Set())
  const [scenarioNotice, setScenarioNotice] = useState(null)
  const [showCreatedToast, setShowCreatedToast] = useState(false)

  // One-time branded toast when arriving fresh from the Smart Bid wizard.
  useEffect(() => {
    if (location.state?.smartBidCreated) {
      setShowCreatedToast(true)
      navigate(location.pathname, { replace: true, state: null })
      const t = setTimeout(() => setShowCreatedToast(false), 6000)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target)) {
        setPdfMenuOpen(false)
      }
    }
    if (pdfMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [pdfMenuOpen])

  // Fetch project + client + company for PDF/Send
  const [projectData, setProjectData] = useState(null)
  const [clientData, setClientData] = useState(null)
  const [companyData, setCompanyData] = useState(null)

  const estimate = builder.estimate

  async function fetchProjectClientCompany() {
    if (!estimate?.project_id) return
    const { data: proj } = await supabase
      .from('projects')
      .select('id, name, address, client_id, company_id, portal_token')
      .eq('id', estimate.project_id)
      .single()
    if (!proj) return
    setProjectData(proj)

    if (proj.client_id) {
      const { data: cli } = await supabase
        .from('clients')
        .select('id, display_name, business_name, primary_email, property_address, client_contacts(email, is_portal_recipient)')
        .eq('id', proj.client_id)
        .single()
      setClientData(cli || null)
    } else {
      setClientData(null)
    }

    if (proj.company_id) {
      const { data: co } = await supabase
        .from('companies')
        .select('id, name, logo_url, primary_color, payment_instructions, state')
        .eq('id', proj.company_id)
        .single()
      if (co) {
        // Pre-fetch logo as data URL for synchronous PDF rendering
        if (co.logo_url) {
          try {
            const res = await fetch(co.logo_url)
            if (res.ok) {
              const blob = await res.blob()
              const reader = new FileReader()
              const logoData = await new Promise(resolve => {
                reader.onloadend = () => resolve(reader.result)
                reader.readAsDataURL(blob)
              })
              co.logo_data = logoData
            }
          } catch { /* logo fetch failed — proceed without */ }
        }
        setCompanyData(co)
      }
    }
  }

  useEffect(() => {
    fetchProjectClientCompany()
  }, [estimate?.project_id])

  // Resolve regional benchmarks for the distinct benchmark_item_ids on the lines.
  const benchIdsKey = (builder.lineItems || [])
    .filter(li => li.benchmark_item_id)
    .map(li => li.benchmark_item_id)
    .sort()
    .join(',')
  useEffect(() => {
    const ids = benchIdsKey ? benchIdsKey.split(',') : []
    if (ids.length === 0) { setBenchmarkMap(new Map()); setBenchLoading(false); return }
    let cancelled = false
    setBenchLoading(true)
    ;(async () => {
      try {
        const map = await fetchBenchmarksByItemIds(supabase, companyData?.state, ids)
        if (!cancelled) setBenchmarkMap(map)
      } catch (err) {
        console.warn('[smart-bid] benchmark fetch failed:', err?.message || err)
      } finally {
        if (!cancelled) setBenchLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [benchIdsKey, companyData?.state])

  const animatedBidTotal = useAnimatedNumber(builder.total)

  // Materials cost from a linked materials order (if any).
  useEffect(() => {
    if (!estimate?.id) return
    let cancelled = false
    ;(async () => {
      const { data: orders } = await supabase
        .from('material_orders')
        .select('id, selected_variant, material_order_items(*)')
        .eq('estimate_id', estimate.id)
      if (cancelled) return
      if (!orders || orders.length === 0) { setMaterials({ cost: null, linked: false }); return }
      let cost = 0
      for (const ord of orders) {
        const variant = ord.selected_variant || 'standard'
        for (const it of (ord.material_order_items || [])) {
          const c = Number(it[`cost_${variant}`])
          if (!c || c < 0) continue
          cost += materialBuyQuantity(it) * c
        }
      }
      setMaterials({ cost, linked: true })
    })()
    return () => { cancelled = true }
  }, [estimate?.id])

  if (builder.loading) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}><div className={styles.empty}>Loading...</div></main>
      </div>
    )
  }

  if (builder.error || !estimate) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}>
          <div className={styles.empty}>{builder.error || 'Estimate not found'}</div>
        </main>
      </div>
    )
  }

  const { lineItems, zones, total, saving } = builder
  const notes = notesValue ?? estimate.notes ?? ''
  const title = titleValue ?? estimate.title ?? ''
  const terms = termsValue ?? estimate.terms ?? ''
  const depositAmount = depositValue ?? estimate.deposit_amount ?? ''
  const depositPercent = calculateDepositPercent(depositAmount, getReferenceTotal(estimate))

  // ── Smart Bid derived values (live from current lines) ──────────────────
  const smart = isSmartEstimate(estimate, lineItems)
  const laborAmount = laborValue ?? estimate.est_labor_cost ?? ''
  const bidTotal = total

  let bandLow = 0, bandTyp = 0, bandHigh = 0, bandAny = false
  for (const li of lineItems) {
    if (!li.benchmark_item_id) continue
    const b = benchmarkMap.get(li.benchmark_item_id)
    if (!b) continue
    bandAny = true
    const q = Number(li.quantity) || 0
    bandLow += q * (Number(b.local_low) || 0)
    bandTyp += q * (Number(b.local_typical) || 0)
    bandHigh += q * (Number(b.local_high) || 0)
  }
  const bidPosition = bandAny ? (bidTotal < bandLow ? 'below' : bidTotal > bandHigh ? 'above' : 'within') : null
  const hasBenchLines = lineItems.some(li => li.benchmark_item_id)
  const sourceName = (() => { for (const v of benchmarkMap.values()) if (v?.source_name) return v.source_name; return null })()
  const regionForLoading = companyData?.state || 'US'
  const VERDICT_LABEL = { within: 'Within market', below: 'Below market', above: 'Above market' }
  const verdictWithin = bidPosition === 'within'

  const laborNum = laborAmount === '' || laborAmount == null ? null : Number(laborAmount)
  const materialsCost = materials.cost
  const grossAfterMaterials = bidTotal - (materialsCost || 0)
  const projectedMargin = laborNum != null ? grossAfterMaterials - laborNum : null
  const projectedMarginPct = projectedMargin != null && bidTotal > 0 ? (projectedMargin / bidTotal) * 100 : null

  const readiness = smart ? [
    { label: 'Every line priced', done: lineItems.length > 0 && lineItems.every(li => Number(li.rate_good) > 0) },
    { label: 'Deposit set', done: depositAmount !== '' && depositAmount != null && Number(depositAmount) > 0 },
    { label: 'Terms present', done: (terms || '').trim() !== '' },
    { label: 'Labor cost entered', done: laborAmount !== '' && laborAmount != null },
    { label: 'Measurements & materials reviewed', done: !!estimate.smart_created },
  ] : []
  const readyCount = readiness.filter(r => r.done).length

  async function handleLaborBlur() {
    const parsed = laborValue === '' || laborValue == null ? null : Number(laborValue)
    if (parsed === (estimate?.est_labor_cost ?? null)) return
    if (parsed != null && (isNaN(parsed) || parsed < 0)) return
    try { await builder.updateEstimate({ est_labor_cost: parsed }) }
    catch (err) { console.error('Labor save failed:', err) }
  }

  // Reprice through the existing line-update path so totals recompute identically.
  // Aggressive/Market/Premium touch benchmark lines only; Custom multiplies each
  // benchmark line's typical, and (when toggled) library lines' current rate.
  function applyScenario(scenario) {
    const mult = scenario === 'custom' ? (Number(customMult) || 0) : 1
    const repriced = []
    for (const li of lineItems) {
      if (li.priced_from === 'benchmark' && li.benchmark_item_id) {
        const b = benchmarkMap.get(li.benchmark_item_id)
        if (!b) continue
        let rate
        if (scenario === 'aggressive') rate = Number(b.local_low) || 0
        else if (scenario === 'market') rate = Number(b.local_typical) || 0
        else if (scenario === 'premium') rate = Number(b.local_high) || 0
        else if (scenario === 'custom') rate = (Number(b.local_typical) || 0) * mult
        else continue
        builder.updateLineItem(li.id, { rate_good: Number(rate.toFixed(2)) })
        repriced.push(li.id)
      } else if (scenario === 'custom' && includeLibraryInCustom && li.priced_from === 'library') {
        const rate = (Number(li.rate_good) || 0) * mult
        builder.updateLineItem(li.id, { rate_good: Number(rate.toFixed(2)) })
        repriced.push(li.id)
      }
    }
    setLastScenario(scenario)
    setPulseIds(new Set(repriced))
    setTimeout(() => setPulseIds(new Set()), 650)
    setScenarioNotice(`${repriced.length} market lines repriced. Your call from here.`)
    setTimeout(() => setScenarioNotice(null), 3500)
    trackMaterials('smart_scenario_applied', { companyId: estimate.company_id, entityId: estimate.id, scenario, surface: 'estimates' })
  }

  async function handleSave() {
    try {
      await builder.saveAll()
      const patch = {}
      if (notesValue !== null) patch.notes = notesValue
      if (titleValue !== null) patch.title = titleValue
      if (termsValue !== null) patch.terms = termsValue
      if (depositValue !== null) {
        patch.deposit_amount = depositValue === '' || depositValue == null ? null : Number(depositValue)
      }
      if (Object.keys(patch).length > 0) {
        await builder.updateEstimate(patch)
      }
      setSaveMsg('Sit, stay, saved!')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (err) {
      alert('Save failed: ' + err.message)
    }
  }

  async function handleTitleBlur() {
    if (titleValue !== null && titleValue !== (estimate.title ?? '')) {
      try {
        await builder.updateEstimate({ title: titleValue || null })
      } catch (err) {
        console.error('Title save failed:', err)
      }
    }
  }

  async function handleNotesBlur() {
    if (notesValue !== null && notesValue !== (estimate.notes ?? '')) {
      try { await builder.updateEstimate({ notes: notesValue }) }
      catch (err) { console.error('Notes save failed:', err) }
    }
  }

  async function handleTermsBlur() {
    if (termsValue !== null && termsValue !== (estimate.terms ?? '')) {
      try { await builder.updateEstimate({ terms: termsValue }) }
      catch (err) { console.error('Terms save failed:', err) }
    }
  }

  async function handleDepositBlur() {
    const parsed = depositValue === '' || depositValue == null ? null : Number(depositValue)
    if (parsed === (estimate?.deposit_amount ?? null)) return
    if (parsed != null && (isNaN(parsed) || parsed < 0)) return
    try { await builder.updateEstimate({ deposit_amount: parsed }) }
    catch (err) { console.error('Deposit save failed:', err) }
  }

  async function handleStatusChange(newStatus) {
    try {
      const patch = { status: newStatus }
      if (newStatus === 'sent' && !estimate.sent_at) patch.sent_at = new Date().toISOString()
      if (newStatus === 'accepted') patch.accepted_at = new Date().toISOString()
      if (newStatus === 'declined') patch.declined_at = new Date().toISOString()
      await builder.updateEstimate(patch)

      // Auto-move project to "Accepted" kanban column (position 5) when
      // estimate is accepted — mirrors the portal accept_estimate RPC behavior.
      if (newStatus === 'accepted' && estimate.project_id && estimate.company_id) {
        const { data: acceptedCol } = await supabase
          .from('kanban_columns')
          .select('id')
          .eq('company_id', estimate.company_id)
          .eq('position', 5)
          .maybeSingle()
        if (acceptedCol) {
          await supabase
            .from('projects')
            .update({ kanban_column_id: acceptedCol.id, updated_at: new Date().toISOString() })
            .eq('id', estimate.project_id)
        }
      }
    } catch (err) {
      alert('Failed to update status: ' + err.message)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this estimate? This cannot be undone.')) return
    try {
      await builder.deleteEstimate()
      navigate(`/project/${estimate.project_id}`)
    } catch (err) {
      alert('Delete failed: ' + err.message)
    }
  }

  function handleDownloadPDF(variant = null) {
    setPdfMenuOpen(false)
    const pdf = generateEstimatePDF({
      estimate: { ...estimate, title: title || null, notes },
      lineItems,
      project: projectData,
      client: clientData,
      company: companyData,
      variant,
      returnAs: 'blob',
    })
    const url = URL.createObjectURL(pdf)
    const a = document.createElement('a')
    a.href = url
    const variantSuffix = variant ? `_${variant}` : '_internal'
    a.download = `estimate_${estimate.estimate_number || estimate.id}${variantSuffix}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleAddZone(zone) {
    setPickerZone(zone)
    setShowPicker(true)
  }

  function handlePickPricingItem(pricingItem) {
    builder.addLineItem({
      description: pricingItem.name,
      category_name: pricingItem.pricing_categories?.name || '',
      pricing_item_id: pricingItem.id,
      unit: pricingItem.unit,
      quantity: pickerZone ? pickerZone.total_result : 0,
      rate_good: pricingItem.default_rate ?? 0,
      source_zone_name: pickerZone ? pickerZone.display_name : null,
      source_measurement_type: pickerZone ? pickerZone.measurement_type : null,
    })
    setShowPicker(false)
    setPickerZone(null)
  }

  const canSend = isAdmin && (estimate.status === 'draft' || estimate.status === 'sent' || estimate.status === 'changes_requested')
  const sendLabel = (estimate.status === 'sent' || estimate.status === 'changes_requested') ? 'Resend to Client' : 'Send to Client'

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        {showCreatedToast && (
          <div className="sb-fadein" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 6px 24px rgba(0,0,0,0.16)' }}>
            <SmartBadge />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text, #1b2426)' }}>Smart Bid ready. Every number has a reason.</span>
          </div>
        )}
        <BackLink to={`/project/${estimate.project_id}`} label="Back to project" />

        {/* Header: editable title + estimate number + status */}
        <div className={styles.headerRow}>
          <div className={styles.titleWrap}>
            {isAdmin ? (
              <input
                className={styles.titleInput}
                value={title}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={handleTitleBlur}
                placeholder="Untitled Estimate"
              />
            ) : (
              <h1 className={styles.title}>{title || 'Untitled Estimate'}</h1>
            )}
            <div className={styles.subline}>
              <span className={styles.estNumber}>{estimate.estimate_number}</span>
              {isAdmin ? (
                <select
                  className={`${styles.statusSelect} ${STATUS_CLASS[estimate.status] || styles.statusDraft}`}
                  value={estimate.status}
                  onChange={e => handleStatusChange(e.target.value)}
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')}</option>
                  ))}
                </select>
              ) : (
                <span className={`${styles.statusBadge} ${STATUS_CLASS[estimate.status] || styles.statusDraft}`}>
                  {estimate.status}
                </span>
              )}
              {estimate.sent_at && (
                <span className={styles.sentIndicator}>Sent {timeAgo(estimate.sent_at)}</span>
              )}
              {smart && <SmartBadge />}
            </div>
            {smart && hasBenchLines && (
              <div style={{ marginTop: 10, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: 12, maxWidth: 560 }}>
                {benchLoading && !bandAny ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-muted)' }}>
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                    Sniffing out {regionForLoading} market rates...
                  </div>
                ) : bandAny ? (
                  <>
                    <MarketBand low={bandLow} typical={bandTyp} high={bandHigh} value={animatedBidTotal} />
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>Market range for this scope: {fmtMoney(bandLow)} to {fmtMoney(bandHigh)}. Your bid: {fmtMoney(animatedBidTotal)}.</span>
                      <span style={{
                        padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
                        background: verdictWithin ? 'rgba(38,70,76,0.12)' : 'rgba(242,114,67,0.14)',
                        color: verdictWithin ? '#26464C' : '#F27243',
                      }}>{VERDICT_LABEL[bidPosition]}</span>
                    </div>
                    {sourceName && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>Powered by {sourceName} market data</div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
          {isAdmin && (
            <div className={styles.headerActions}>
              {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
              <button className={styles.toolBtn} onClick={() => handleDownloadPDF(null)} title="Download PDF">
                <Download size={15} /> PDF
              </button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                <Save size={15} /> {saving ? 'Saving...' : 'Save'}
              </button>
              {estimate?.status === 'accepted' && (
                <button className={styles.toolBtn} onClick={() => navigate(`/invoices/new?from_estimate=${estimate.id}`)} title="Create invoice from this estimate">
                  <FileText size={15} /> Create Invoice
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.builderLayout}>
          <aside className={styles.sidePanel}>
            <ZoneAggregationPanel
              zones={zones}
              onAddZone={handleAddZone}
              onRefresh={builder.refreshZones}
              readOnly={!isAdmin}
            />
          </aside>

          <div className={styles.mainPanel}>
            {isAdmin && (
              <div className={styles.toolbar}>
                <button className={styles.toolBtn} onClick={() => setShowPicker(true)}>
                  <Package size={14} /> Add from Pricing Library
                </button>
                <button className={styles.toolBtn} onClick={() => builder.addLineItem({
                  description: '',
                  category_name: '',
                  unit: 'sf',
                  quantity: 0,
                  rate_good: 0,
                  rate_better: 0,
                  rate_best: 0,
                })}>
                  <Plus size={14} /> Add Blank Line
                </button>
              </div>
            )}

            {smart && isAdmin && (
              <div style={{ marginBottom: 12, padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>Price scope:</span>
                  {[['aggressive', 'Aggressive'], ['market', 'Market'], ['premium', 'Premium']].map(([key, label]) => {
                    const active = lastScenario === key
                    return (
                      <button key={key} onClick={() => applyScenario(key)} style={{
                        padding: '5px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: active ? '1px solid #F27243' : '1px solid var(--color-border)',
                        background: active ? '#F27243' : 'var(--color-surface)',
                        color: active ? '#fff' : 'var(--color-text, #1b2426)',
                      }}>{label}</button>
                    )
                  })}
                  <span style={{ width: 1, height: 20, background: 'var(--color-border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Custom ×</span>
                  <input type="number" step="0.01" min="0" value={customMult} onChange={e => setCustomMult(e.target.value)}
                    style={{ width: 70, padding: '5px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)' }} />
                  <button onClick={() => applyScenario('custom')} style={{
                    padding: '5px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: lastScenario === 'custom' ? '#F27243' : 'var(--color-primary)', color: '#fff',
                  }}>Apply</button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    <input type="checkbox" checked={includeLibraryInCustom} onChange={e => setIncludeLibraryInCustom(e.target.checked)} />
                    Include library-priced lines
                  </label>
                </div>
                {scenarioNotice && (
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#F27243' }}>{scenarioNotice}</div>
                )}
              </div>
            )}

            {estimate.status === 'changes_requested' && (
              <div style={{ background: 'rgba(242,114,67,0.14)', borderLeft: '3px solid #F27243', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: 'var(--color-text, #1b2426)', marginBottom: 4 }}>Client requested changes</div>
                {estimate.change_request_comment && (
                  <div style={{ fontSize: 14, color: 'var(--color-text, #1b2426)', lineHeight: 1.5, marginBottom: 6 }}>{estimate.change_request_comment}</div>
                )}
                {estimate.changes_requested_at && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>{timeAgo(estimate.changes_requested_at)}</div>
                )}
                <div style={{ fontSize: 13, color: 'var(--color-text, #1b2426)' }}>Revise the estimate and resend.</div>
              </div>
            )}

            <LineItemsTable
              lineItems={lineItems}
              onUpdate={builder.updateLineItem}
              onRemove={builder.removeLineItem}
              readOnly={!isAdmin}
              smart={smart}
              benchmarkMap={benchmarkMap}
              pulseIds={pulseIds}
            />

            <div className={styles.totalsCard}>
              <div className={`${styles.totalRow} ${styles.totalRowBest}`}>
                <span>Estimate Total</span>
                <span className={styles.totalValue}>
                  {fmtMoney(estimate ? getDisplayTotal(estimate) : total)}
                </span>
              </div>
            </div>

            {smart && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
                {/* Margin panel */}
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Margin</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span>Bid total</span><strong>{fmtMoney(animatedBidTotal)}</strong></div>
                  {materials.linked ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}><span>Materials cost</span><span>{fmtMoney(materialsCost)}</span></div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>No materials order linked to this estimate yet.</div>
                  )}
                  {isAdmin && (
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, fontSize: 13 }}>
                      <span>Your estimated labor cost</span>
                      <input type="number" step="0.01" min="0" placeholder="optional"
                        value={laborAmount === 0 || laborAmount == null ? '' : laborAmount}
                        onChange={e => setLaborValue(e.target.value)}
                        onBlur={handleLaborBlur}
                        style={{ width: 120, padding: '5px 8px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)' }} />
                    </label>
                  )}
                  {laborNum == null ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
                      <span>Gross after materials</span><strong>{fmtMoney(grossAfterMaterials)}</strong>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
                      <span>Projected margin</span>
                      <strong>{fmtMoney(projectedMargin)}{projectedMarginPct != null ? ` (${projectedMarginPct.toFixed(1)}%)` : ''}</strong>
                    </div>
                  )}
                </div>

                {/* Readiness checklist */}
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Bid readiness <span style={{ fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 13 }}>({readyCount} of {readiness.length} complete)</span></div>
                  <div style={{ height: 8, borderRadius: 9999, background: 'var(--color-border, #d4d4d4)', overflow: 'hidden', marginBottom: 12 }}>
                    <div className="sb-progress-fill" style={{ height: '100%', width: `${readiness.length ? (readyCount / readiness.length) * 100 : 0}%`, background: 'var(--color-primary, #26464C)', borderRadius: 9999 }} />
                  </div>
                  {readiness.map(r => (
                    <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 5, color: r.done ? 'var(--color-text, #1b2426)' : 'var(--color-text-muted)' }}>
                      <Check size={14} style={{ color: r.done ? 'var(--color-success, #16a34a)' : 'var(--color-border, #d4d4d4)' }} />
                      {r.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Send to Client CTA */}
            {canSend && (
              <button className={styles.sendBtn} onClick={async () => { await fetchProjectClientCompany(); setShowSendModal(true) }}>
                <Send size={16} /> {sendLabel}
              </button>
            )}

            <div className={styles.editSection}>
              <label className={styles.editLabel}>Notes</label>
              <textarea
                className={styles.editTextarea}
                value={notes}
                onChange={e => setNotesValue(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Project scope, what's included or excluded, special instructions..."
                readOnly={!isAdmin}
                rows={4}
              />
            </div>

            {isAdmin && (
              <div className={styles.editSection}>
                <label className={styles.editLabel}>Deposit Required</label>
                <div className={styles.depositRow}>
                  <div className={styles.depositInputWrap}>
                    <span className={styles.depositDollar}>$</span>
                    <input
                      type="number"
                      className={styles.depositInput}
                      value={depositAmount === 0 || depositAmount == null ? '' : depositAmount}
                      onChange={e => setDepositValue(e.target.value)}
                      onBlur={handleDepositBlur}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  {depositPercent != null && (
                    <span className={styles.depositPercent}>
                      {depositPercent}%
                      {!estimate?.selected_variant && (
                        <span className={styles.depositPercentHint}> of total</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className={styles.editSection}>
              <label className={styles.editLabel}>Terms &amp; Conditions</label>
              <textarea
                className={styles.editTextarea}
                value={terms}
                onChange={e => setTermsValue(e.target.value)}
                onBlur={handleTermsBlur}
                placeholder="Deposit schedule, payment terms, warranty, cancellation policy..."
                readOnly={!isAdmin}
                rows={5}
              />
            </div>

            {isAdmin && (
              <button className={styles.deleteBtn} onClick={handleDelete}>
                <Trash2 size={15} /> Delete Estimate
              </button>
            )}
          </div>
        </div>
      </main>

      {showPicker && (
        <PricingItemPicker
          zone={pickerZone}
          categories={categories}
          items={pricingItems}
          onPick={handlePickPricingItem}
          onClose={() => { setShowPicker(false); setPickerZone(null) }}
        />
      )}

      {showSendModal && (
        <SendEstimateModal
          estimate={{ ...estimate, title: title || null, notes }}
          lineItems={lineItems}
          project={projectData}
          client={clientData}
          company={companyData}
          onClose={() => setShowSendModal(false)}
          onSent={() => {
            setShowSendModal(false)
            builder.refetch()
          }}
        />
      )}
    </div>
  )
}
