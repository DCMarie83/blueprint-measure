import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Layers } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import { useAuth } from '../context/AuthContext'
import { useMaterialOrderBuilder } from '../hooks/useMaterialOrderBuilder'
import MaterialLineItemsTable from '../components/materials/MaterialLineItemsTable'
import MaterialsStartScreen from '../components/materials/MaterialsStartScreen'
import MaterialsQuickTotal from '../components/materials/MaterialsQuickTotal'
import MaterialsSwiper from '../components/materials/MaterialsSwiper'
import { materialBuyQuantity } from '../utils/measurements'
import { buildCatalogLookups, gradeTotal, unitCostAtGrade } from '../lib/materialsView'
import { trackMaterials } from '../lib/analytics'

const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600 }
const brandChip = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600, background: 'rgba(38,70,76,0.08)', color: '#26464C', whiteSpace: 'nowrap' }

const GRADE_KEYS = ['premium', 'standard', 'commercial']
const DEFAULT_GRADE = 'standard'
const gradeLabel = (k) => k.charAt(0).toUpperCase() + k.slice(1)

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// gradeTotal now comes from materialsView (shared grade-invariant fallback).

function buildShopUrl(store, orderId) {
  const base = store?.affiliate_url
  if (!base) return null
  if (base.includes('{SUBID}')) return base.replace(/\{SUBID\}/g, encodeURIComponent(orderId))
  try {
    const u = new URL(base)
    u.searchParams.set('subid', orderId)
    return u.toString()
  } catch {
    return base
  }
}

function exportMaterialsCsv(order, items) {
  const header = [
    'Description', 'Unit', 'Buy quantity', 'Overage %', 'Coats',
    'Premium product', 'Premium est. cost',
    'Standard product', 'Standard est. cost',
    'Commercial product', 'Commercial est. cost',
  ]
  const rows = items.map(it => {
    const buyQty = materialBuyQuantity(it)
    return [
      it.description || '',
      it.unit || '',
      buyQty,
      Number(it.overage_pct) || 0,
      Number(it.coats) || 1,
      it.product_premium || '', unitCostAtGrade(it, 'premium'),
      it.product_standard || '', unitCostAtGrade(it, 'standard'),
      it.product_commercial || '', unitCostAtGrade(it, 'commercial'),
    ]
  })
  const csv = [header, ...rows]
    .map(r => r.map(c => {
      const s = String(c ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = (order.title || 'materials-order').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function MaterialOrderBuilderPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { userProfile, isSuperAdmin } = useAuth()
  const isAdmin = userProfile?.role === 'contractor_admin' || isSuperAdmin

  const estimateEntryId = location.state?.estimateId || null
  const returnTo = location.state?.returnTo || null

  const {
    order, items, zones, stores, estimates, catalog, overrideMap, maxPriceAsOf, storeNameById, loadWarnings, loading, saving, error,
    addItem, replaceItems, updateItem, removeItem, updateOrderField, persistEstimateId,
    seedFromEstimate, seedFromZones, buildSuggested, saveLines, aiSuggest, aiSuggesting, saveAll,
  } = useMaterialOrderBuilder(orderId)

  const [notice, setNotice] = useState(null)
  const [showAiTip, setShowAiTip] = useState(false)

  // Catalog id/slug lookups for ItemVisual imagery + category resolution.
  const lookups = useMemo(() => buildCatalogLookups(catalog), [catalog])

  // Flow view: start | quick | swipe | table. Decided once after load.
  const [view, setView] = useState(null)
  const [flowLines, setFlowLines] = useState([])   // suggested/kept set for quick+swipe
  const [swipeMode, setSwipeMode] = useState('new') // 'new' | 'existing'

  const defaultedForOrderId = useRef(null)
  useEffect(() => {
    if (!order?.id) return
    if (defaultedForOrderId.current === order.id) return
    defaultedForOrderId.current = order.id
    if (!order.selected_variant) updateOrderField({ selected_variant: DEFAULT_GRADE })
    // Initial view: existing lines -> table; empty -> start.
    setView(items.length > 0 ? 'table' : 'start')
  }, [order?.id, order?.selected_variant, items.length, updateOrderField])

  if (loading || view === null) {
    return (
      <div>
        <AppHeader />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
          <p style={{ color: 'var(--color-text-muted)' }}>Fetching your materials...</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div>
        <AppHeader />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
          <BackLink to="/dashboard" label="dashboard" />
          <p style={{ color: 'var(--color-text-muted)', marginTop: 16 }}>Materials order not found.</p>
        </div>
      </div>
    )
  }

  const estimateLabel = (est) => {
    const d = est.created_at ? new Date(est.created_at).toLocaleDateString() : ''
    const v = est.selected_variant ? ` (${est.selected_variant})` : ''
    const tail = est.id ? ` · ${est.id.slice(0, 4)}` : ''
    return `Estimate · ${d}${v}${tail}`
  }

  const hasZones = (zones?.length ?? 0) > 0
  const variant = order.selected_variant || null
  const gradeForFlow = variant || DEFAULT_GRADE
  const storeName = storeNameById?.get(order.store_id) || null

  function setGrade(g) {
    updateOrderField({ selected_variant: g })
    trackMaterials('grade_selected', { companyId: order.company_id, entityId: order.id, grade: g })
  }

  // ── Start-mode dispatch ──
  function startQuick() {
    setFlowLines(buildSuggested())
    setView('quick')
    trackMaterials('materials_flow_started', { companyId: order.company_id, entityId: order.id, mode: 'quick' })
    quickTotalViewed(gradeForFlow)
  }
  function startSwipe() {
    setFlowLines(buildSuggested())
    setSwipeMode('new')
    setView('swipe')
    trackMaterials('materials_flow_started', { companyId: order.company_id, entityId: order.id, mode: 'review' })
  }
  function startTable() {
    setView('table')
    trackMaterials('materials_flow_started', { companyId: order.company_id, entityId: order.id, mode: 'build' })
  }

  // ── Quick Total actions ──
  async function quickSave() {
    const ok = await saveLines(flowLines, { grade: gradeForFlow, estimateId: estimateEntryId ?? undefined })
    if (!ok) { setNotice('Save failed — see the error above.'); return }
    trackMaterials('material_order_saved', { companyId: order.company_id, entityId: order.id, line_count: flowLines.length, selected_grade: gradeForFlow })
    if (estimateEntryId && returnTo) { navigate(returnTo); return }
    setNotice(`Materials list saved. ${flowLines.length} items.`)
    setView('table')
  }

  // ── Swiper actions ──
  async function swiperSave(kept) {
    const ok = await saveLines(kept, { grade: gradeForFlow, estimateId: estimateEntryId ?? undefined })
    if (!ok) { setNotice('Save failed — see the error above.'); return }
    trackMaterials('material_order_saved', { companyId: order.company_id, entityId: order.id, line_count: kept.length, selected_grade: gradeForFlow })
    if (estimateEntryId && returnTo) { navigate(returnTo); return }
    setNotice(`Materials list saved. ${kept.length} items.`)
    setView('table')
  }
  function swiperEdit(kept) {
    replaceItems(kept)
    setView('table')
  }
  function swiperExport(kept) {
    exportMaterialsCsv(order, kept)
    trackMaterials('materials_csv_exported', { companyId: order.company_id, entityId: order.id, storeId: order.store_id || null, line_count: kept.length })
  }
  function reviewComplete({ kept, removed }) {
    trackMaterials('materials_review_completed', { companyId: order.company_id, entityId: order.id, kept, removed })
  }
  function quickTotalViewed(grade) {
    trackMaterials('materials_quick_total_viewed', { companyId: order.company_id, entityId: order.id, grade })
  }

  // ── Table-mode handlers (existing editor) ──
  const handleSave = async () => {
    setNotice(null)
    const ok = await saveAll()
    if (ok) {
      trackMaterials('material_order_saved', { companyId: order.company_id, entityId: order.id, storeId: order.store_id || null, line_count: items.length, selected_grade: order.selected_variant || null })
    }
    setNotice(ok ? 'Saved.' : 'Save failed — see the error above.')
  }

  const handleSeedFromZones = async () => {
    setNotice('Building your materials list from this job\'s measurements…')
    const r = seedFromZones()
    if (r?.error) { setNotice(r.error); return }
    trackMaterials('order_seeded_from_zones', { companyId: order.company_id, entityId: order.id, line_count: r.count })
    if (r.sundries > 0) trackMaterials('sundries_seeded', { companyId: order.company_id, entityId: order.id, count: r.sundries })
    const sundryNote = r.sundries > 0 ? ` plus ${r.sundries} sundr${r.sundries === 1 ? 'y' : 'ies'} from the catalog` : ''
    setNotice(`Built ${r.count} paint line${r.count === 1 ? '' : 's'}${sundryNote} from measurements. Match to the catalog to fill in products and pricing.`)
  }

  const handleAiSuggest = async () => {
    if (items.length === 0) { setNotice('Add or seed at least one line first so there is something to map.'); return }
    setNotice('Matching your lines to the catalog…')
    trackMaterials('ai_map_requested', { companyId: order.company_id, entityId: order.id, storeId: order.store_id || null, line_count: items.length })
    const r = await aiSuggest()
    if (!r || r.error) {
      setNotice(`Couldn't map to the catalog right now — you can enter products and costs by hand.${r?.error ? ` (${r.error})` : ''}`)
    } else {
      trackMaterials('ai_map_completed', { companyId: order.company_id, entityId: order.id, storeId: order.store_id || null, mapped: r.mapped, additions: r.additions, not_in_catalog: r.notInCatalog })
      const addNote = r.additions ? `, added ${r.additions} suppl${r.additions === 1 ? 'y' : 'ies'}` : ''
      const missNote = r.notInCatalog ? `, ${r.notInCatalog} not in catalog` : ''
      setNotice(`Mapped ${r.mapped} line${r.mapped === 1 ? '' : 's'} to the catalog${addNote}${missNote}. Prices come from the catalog — set My Price on the Pricing page to override.`)
    }
  }

  const handleEstimateChange = async (estimateId) => {
    const nextId = estimateId || null
    updateOrderField({ estimate_id: nextId })
    const persistRes = await persistEstimateId(nextId)
    if (persistRes?.error) { setNotice(`Couldn't save the estimate link: ${persistRes.error}`); return }
    if (estimateId && items.length === 0) {
      setNotice('Building your materials list from the estimate…')
      const r = await seedFromEstimate(estimateId)
      if (r?.error) setNotice(r.error)
      else {
        trackMaterials('order_seeded_from_estimate', { companyId: order.company_id, entityId: order.id, line_count: r.count, estimate_id: estimateId })
        setNotice(r.fallback
          ? `Built ${r.count} lines from this job's measurements for the linked estimate.`
          : `Built ${r.count} material line${r.count === 1 ? '' : 's'} from the estimate. Pick a store and suggest products to fill in pricing.`)
      }
    }
  }

  const handleRebuild = async () => {
    if (!order?.estimate_id) return
    if (items.length > 0 && !window.confirm('Rebuild the list from this estimate? This replaces the current line items.')) return
    setNotice('Rebuilding from the estimate…')
    const r = await seedFromEstimate(order.estimate_id)
    if (r?.error) setNotice(r.error)
    else {
      trackMaterials('order_seeded_from_estimate', { companyId: order.company_id, entityId: order.id, line_count: r.count, estimate_id: order.estimate_id, rebuild: true })
      setNotice(r.fallback
        ? `Built ${r.count} lines from this job's measurements for the linked estimate.`
        : `Rebuilt ${r.count} material line${r.count === 1 ? '' : 's'} from the estimate.`)
    }
  }

  // Segmented-control setter for the table's sticky summary bar (always selects, never clears).
  const handleGradeSet = (t) => {
    if (!isAdmin) return
    updateOrderField({ selected_variant: t })
    trackMaterials('grade_selected', { companyId: order.company_id, entityId: order.id, grade: t })
  }

  const handleCsvExport = () => {
    exportMaterialsCsv(order, items)
    trackMaterials('materials_csv_exported', { companyId: order.company_id, entityId: order.id, storeId: order.store_id || null, line_count: items.length })
  }

  const handleShopClick = (store) => {
    trackMaterials('shop_link_clicked', { companyId: order.company_id, entityId: order.id, storeId: store?.id || null, store_name: store?.name || null })
  }

  const selectedStore = stores.find(s => s.id === order.store_id) || null
  const shopUrl = selectedStore && selectedStore.integration_type === 'affiliate_deeplink' && selectedStore.affiliate_enabled
    ? buildShopUrl(selectedStore, order.id)
    : null

  return (
    <div>
      <AppHeader />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <BackLink to={`/project/${order.project_id}`} label="project" />

        {view === 'start' && (
          <MaterialsStartScreen hasZones={hasZones} onQuick={startQuick} onSwipe={startSwipe} onTable={startTable} />
        )}

        {view === 'quick' && (
          <MaterialsQuickTotal
            lines={flowLines}
            grade={gradeForFlow}
            onGradeChange={(g) => { setGrade(g); quickTotalViewed(g) }}
            maxPriceAsOf={maxPriceAsOf}
            estimateEntry={!!estimateEntryId}
            saving={saving}
            onSave={quickSave}
            onReview={() => { setSwipeMode('new'); setView('swipe') }}
            onBack={() => setView('start')}
            lookups={lookups}
          />
        )}

        {view === 'swipe' && (
          <MaterialsSwiper
            lines={swipeMode === 'existing' ? items : flowLines}
            grade={gradeForFlow}
            onGradeChange={setGrade}
            storeName={storeName}
            saving={saving}
            onSave={swiperSave}
            onEditDetails={swiperEdit}
            onExportCsv={swiperExport}
            onReviewComplete={reviewComplete}
            lookups={lookups}
          />
        )}

        {view === 'table' && (
          <>
            {/* Header + brand stat strip */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 12px' }}>
              <input
                value={order.title || ''}
                disabled={!isAdmin}
                placeholder="Untitled materials order"
                onChange={e => updateOrderField({ title: e.target.value })}
                style={{ flex: 1, minWidth: 240, fontSize: 22, fontWeight: 700, padding: '6px 10px', border: '1px solid transparent', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text, #1b2426)' }}
              />
              <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 9999, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{order.status}</span>
            </div>

            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
              Your full list. Edit quantities, coats, and prices per grade.
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 14px' }}>
              Prices are regional estimates for reference and building your strongest bid. Confirm current pricing with your local store. Product photos are illustrations only.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              <span style={brandChip}>Items {items.length}</span>
              <span style={brandChip}>Total at {gradeLabel(gradeForFlow)} {money(gradeTotal(items, gradeForFlow))}</span>
              <span style={brandChip}>Store {storeName || '—'}</span>
              <span style={brandChip}>Prices as of {maxPriceAsOf || '—'}</span>
              {items.length > 0 && (
                <button onClick={() => { setSwipeMode('existing'); setView('swipe') }} style={{ ...secondaryBtn, marginLeft: 'auto' }}>
                  <Layers size={14} /> Review as cards
                </button>
              )}
            </div>

            {error && (
              <div style={{ background: 'var(--color-danger-bg, #fef2f2)', color: 'var(--color-danger, #dc2626)', border: '1px solid var(--color-danger, #dc2626)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>
            )}

            {isAdmin && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
                  Materials for:
                  <select value={order?.estimate_id || ''} onChange={(e) => handleEstimateChange(e.target.value || null)}
                    style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border, #d4d4d4)', fontSize: 14, background: 'var(--color-surface, #fff)', color: 'var(--color-text)' }}>
                    <option value="">Select an estimate…</option>
                    {estimates.map((est) => (
                      est.__unavailable
                        ? <option key={est.id} value={est.id} disabled>Linked estimate unavailable</option>
                        : <option key={est.id} value={est.id}>{estimateLabel(est)}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
                  Buying from:
                  <select value={order?.store_id || ''} onChange={(e) => updateOrderField({ store_id: e.target.value || null })}
                    style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border, #d4d4d4)', fontSize: 14, background: 'var(--color-surface, #fff)', color: 'var(--color-text)' }}>
                    <option value="">Select a store…</option>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>

                {hasZones && <button onClick={handleSeedFromZones} style={secondaryBtn}>Suggest from measurements</button>}

                <span style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => setShowAiTip(true)} onMouseLeave={() => setShowAiTip(false)}>
                  <button onClick={handleAiSuggest} onFocus={() => setShowAiTip(true)} onBlur={() => setShowAiTip(false)} disabled={aiSuggesting || items.length === 0}
                    style={{ ...secondaryBtn, opacity: (aiSuggesting || items.length === 0) ? 0.6 : 1, cursor: (aiSuggesting || items.length === 0) ? 'default' : 'pointer' }}>
                    {aiSuggesting ? 'Matching…' : 'Match to catalog'}
                  </button>
                  {showAiTip && (
                    <span role="tooltip" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 280, padding: '8px 10px', fontSize: 12, lineHeight: 1.4, background: 'var(--color-text, #1b2426)', color: '#fff', borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.18)' }}>
                      Matches each line to a catalog item and fills Premium/Standard/Commercial products and catalog prices. Catalog prices are estimates — set My Price on the Pricing page to override.
                    </span>
                  )}
                </span>

                <button onClick={() => addItem()} style={secondaryBtn}>+ Add line</button>

                {order?.estimate_id && (
                  <button onClick={handleRebuild} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #26464c)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                    Rebuild from estimate
                  </button>
                )}
              </div>
            )}

            {loadWarnings && loadWarnings.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                {loadWarnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}

            {notice && <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>{notice}</div>}

            <MaterialLineItemsTable
              items={items} onUpdate={updateItem} onRemove={removeItem} readOnly={!isAdmin}
              overrideMap={overrideMap} selectedGrade={gradeForFlow} lookups={lookups}
              onGradeChange={handleGradeSet} onExportCsv={handleCsvExport} onSave={handleSave} saving={saving}
            />

            <div style={{ marginTop: 28, borderTop: '1px solid var(--color-border)', paddingTop: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 14px' }}>Order summary</h3>

              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
                Estimated totals — verify final price and availability with the retailer. Pick your buying grade and save from the bar below the list.
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 18px' }}>
                {maxPriceAsOf ? `Catalog prices as of ${maxPriceAsOf}, estimates only. My Price applies where you've set it.` : 'Catalog prices are estimates only. My Price applies where you’ve set it.'}
              </p>

              {!selectedStore && <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Select a store above to shop or export your list.</p>}
              {selectedStore && shopUrl && (
                <div>
                  <a href={shopUrl} target="_blank" rel="noopener noreferrer" onClick={() => handleShopClick(selectedStore)} style={{ ...primaryBtn, textDecoration: 'none' }}>Shop at {selectedStore.name}</a>
                  {selectedStore.affiliate_disclosure && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '8px 0 0', maxWidth: 520 }}>{selectedStore.affiliate_disclosure}</p>}
                </div>
              )}
              {selectedStore && !shopUrl && selectedStore.integration_type === 'affiliate_deeplink' && selectedStore.website_url && (
                <a href={selectedStore.website_url} target="_blank" rel="noopener noreferrer" onClick={() => handleShopClick(selectedStore)} style={{ ...primaryBtn, textDecoration: 'none' }}>Shop at {selectedStore.name}</a>
              )}
              {selectedStore && !shopUrl && selectedStore.integration_type === 'affiliate_deeplink' && !selectedStore.website_url && (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No shopping link available for {selectedStore.name} yet.</p>
              )}
              {selectedStore && !shopUrl && selectedStore.integration_type !== 'affiliate_deeplink' && (
                <button onClick={handleCsvExport} style={secondaryBtn}>
                  {selectedStore.integration_type === 'placeholder' ? `Export for ${selectedStore.name} (CSV)` : 'Export list (CSV)'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
