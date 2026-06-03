import { useParams } from 'react-router-dom'
import { useState } from 'react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import { useAuth } from '../context/AuthContext'
import { useMaterialOrderBuilder } from '../hooks/useMaterialOrderBuilder'
import MaterialLineItemsTable from '../components/materials/MaterialLineItemsTable'

const secondaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600 }

const TIER_KEYS = ['good', 'better', 'best']
const tierLabel = (k) => k.charAt(0).toUpperCase() + k.slice(1)

function money(n) {
  return '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Per-tier estimated total: sum of quantity x (1 + overage/100) x tier cost.
function tierTotal(items, tierKey) {
  return items.reduce((sum, it) => {
    const qty = Number(it.quantity) || 0
    const over = Number(it.overage_pct) || 0
    const cost = Number(it[`cost_${tierKey}`])
    if (!cost || cost < 0) return sum
    return sum + qty * (1 + over / 100) * cost
  }, 0)
}

// Build the outbound affiliate URL with a per-order sub-id. The affiliate_url
// (set at approval) may contain a {SUBID} placeholder where the order id goes;
// otherwise the order id is appended as a `subid` query param.
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

function exportMaterialsCsv(order, items, tierKey) {
  const label = tierKey ? tierLabel(tierKey) : 'Selected'
  const header = ['Description', `Product (${label})`, 'Unit', 'Buy quantity', 'Overage %', 'Est. unit cost', 'Est. line cost']
  const rows = items.map(it => {
    const qty = Number(it.quantity) || 0
    const over = Number(it.overage_pct) || 0
    const buyQty = qty * (1 + over / 100)
    const cost = tierKey ? (Number(it[`cost_${tierKey}`]) || 0) : 0
    const product = tierKey ? (it[`product_${tierKey}`] || '') : ''
    return [it.description || '', product, it.unit || '', buyQty, over, cost, (buyQty * cost).toFixed(2)]
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
  const { user, userProfile } = useAuth()
  const isAdmin = userProfile?.role === 'contractor_admin' || user?.email === 'main@ngautomationhub.com'

  const {
    order, items, stores, estimates, loading, saving, error,
    addItem, updateItem, removeItem, updateOrderField,
    seedFromEstimate, aiSuggest, aiSuggesting, saveAll,
  } = useMaterialOrderBuilder(orderId)

  const [notice, setNotice] = useState(null)
  const [showAiTip, setShowAiTip] = useState(false)

  if (loading) {
    return (
      <div>
        <AppHeader />
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
          <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
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

  const handleSave = async () => {
    setNotice(null)
    const ok = await saveAll()
    setNotice(ok ? 'Saved.' : 'Save failed — see the error above.')
  }

  const handleAiSuggest = async () => {
    if (!order?.estimate_id) {
      setNotice('Pick an estimate first so the list has something to price.')
      return
    }
    if (!order?.store_id) {
      setNotice('Pick a store first so I can suggest products it carries.')
      return
    }
    const storeName = stores.find((s) => s.id === order.store_id)?.name || 'your store'
    setNotice(`Filling in products and pricing from ${storeName}…`)
    const r = await aiSuggest()
    if (!r || r.error) {
      setNotice(`Couldn't fetch suggestions right now — you can enter products and costs by hand.${r?.error ? ` (${r.error})` : ''}`)
    } else {
      setNotice(`Nice fetch — ${r.filled} product pick${r.filled === 1 ? '' : 's'} from ${storeName}${r.added ? ` plus ${r.added} extra${r.added === 1 ? '' : 's'}` : ''}. Costs are estimates, so double-check before buying.`)
    }
  }

  const handleEstimateChange = async (estimateId) => {
    updateOrderField({ estimate_id: estimateId || null })
    if (estimateId && items.length === 0) {
      setNotice('Building your materials list from the estimate…')
      const r = await seedFromEstimate(estimateId)
      if (r?.error) setNotice(r.error)
      else setNotice(`Built ${r.count} material line${r.count === 1 ? '' : 's'} from the estimate. Pick a store and suggest products to fill in pricing.`)
    }
  }

  const handleRebuild = async () => {
    if (!order?.estimate_id) return
    if (items.length > 0 && !window.confirm('Rebuild the list from this estimate? This replaces the current line items.')) return
    setNotice('Rebuilding from the estimate…')
    const r = await seedFromEstimate(order.estimate_id)
    if (r?.error) setNotice(r.error)
    else setNotice(`Rebuilt ${r.count} material line${r.count === 1 ? '' : 's'} from the estimate.`)
  }

  const variant = order.selected_variant || null
  const selectedStore = stores.find(s => s.id === order.store_id) || null
  const shopUrl = selectedStore && selectedStore.integration_type === 'affiliate_deeplink' && selectedStore.affiliate_enabled
    ? buildShopUrl(selectedStore, order.id)
    : null

  return (
    <div>
      <AppHeader />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        <BackLink to={`/project/${order.project_id}`} label="project" />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 20px' }}>
          <input
            value={order.title || ''}
            disabled={!isAdmin}
            placeholder="Untitled materials order"
            onChange={e => updateOrderField({ title: e.target.value })}
            style={{ flex: 1, minWidth: 240, fontSize: 22, fontWeight: 700, padding: '6px 10px', border: '1px solid transparent', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text, #1b2426)' }}
          />
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 9999, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{order.status}</span>
        </div>

        {error && (
          <div style={{ background: 'var(--color-danger-bg, #fef2f2)', color: 'var(--color-danger, #dc2626)', border: '1px solid var(--color-danger, #dc2626)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}

        {isAdmin && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
              Materials for:
              <select
                value={order?.estimate_id || ''}
                onChange={(e) => handleEstimateChange(e.target.value || null)}
                style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border, #d4d4d4)', fontSize: 14, background: 'var(--color-surface, #fff)', color: 'var(--color-text)' }}
              >
                <option value="">Select an estimate…</option>
                {estimates.map((est) => (
                  <option key={est.id} value={est.id}>{estimateLabel(est)}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
              Buying from:
              <select
                value={order?.store_id || ''}
                onChange={(e) => updateOrderField({ store_id: e.target.value || null })}
                style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border, #d4d4d4)', fontSize: 14, background: 'var(--color-surface, #fff)', color: 'var(--color-text)' }}
              >
                <option value="">Select a store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <span
              style={{ position: 'relative', display: 'inline-flex' }}
              onMouseEnter={() => setShowAiTip(true)}
              onMouseLeave={() => setShowAiTip(false)}
            >
              <button
                onClick={handleAiSuggest}
                onFocus={() => setShowAiTip(true)}
                onBlur={() => setShowAiTip(false)}
                disabled={aiSuggesting || !order?.estimate_id}
                style={{ ...secondaryBtn, opacity: (aiSuggesting || !order?.estimate_id) ? 0.6 : 1, cursor: (aiSuggesting || !order?.estimate_id) ? 'default' : 'pointer' }}
              >
                {aiSuggesting ? 'Filling…' : 'Suggest products & pricing'}
              </button>
              {showAiTip && (
                <span
                  role="tooltip"
                  style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20,
                    width: 280, padding: '8px 10px', fontSize: 12, lineHeight: 1.4,
                    background: 'var(--color-text, #1b2426)', color: '#fff',
                    borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                  }}
                >
                  Suggests Good/Better/Best products carried at your selected store, with estimated costs. Costs are estimates — confirm before you buy.
                </span>
              )}
            </span>

            <button onClick={() => addItem()} style={secondaryBtn}>+ Add line</button>

            {order?.estimate_id && (
              <button
                onClick={handleRebuild}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary, #26464c)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
              >
                Rebuild from estimate
              </button>
            )}

          </div>
        )}

        {notice && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>{notice}</div>
        )}

        <MaterialLineItemsTable items={items} onUpdate={updateItem} onRemove={removeItem} readOnly={!isAdmin} />

        <div style={{ marginTop: 28, borderTop: '1px solid var(--color-border)', paddingTop: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 14px' }}>Order summary</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Buying tier:</span>
            {TIER_KEYS.map(t => {
              const active = variant === t
              return (
                <button
                  key={t}
                  onClick={() => isAdmin && updateOrderField({ selected_variant: active ? null : t })}
                  disabled={!isAdmin}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-pill, 9999px)', fontSize: 13, fontWeight: 600, cursor: isAdmin ? 'pointer' : 'default',
                    border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: active ? 'var(--color-on-primary, #fff)' : 'var(--color-text, #1b2426)',
                  }}
                >
                  {tierLabel(t)}
                </button>
              )
            })}
            {variant && isAdmin && (
              <button onClick={() => updateOrderField({ selected_variant: null })} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 12, cursor: 'pointer' }}>Clear</button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 8 }}>
            {TIER_KEYS.map(t => {
              const active = variant === t
              return (
                <div key={t} style={{ border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px 14px', background: 'var(--color-surface)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>{tierLabel(t)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text, #1b2426)' }}>{money(tierTotal(items, t))}</div>
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 18px' }}>
            Estimated totals — verify final price and availability with the retailer.
          </p>

          {!selectedStore && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Select a store above to shop or export your list.</p>
          )}
          {selectedStore && shopUrl && (
            <div>
              <a href={shopUrl} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, textDecoration: 'none' }}>
                Shop at {selectedStore.name}
              </a>
              {selectedStore.affiliate_disclosure && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '8px 0 0', maxWidth: 520 }}>{selectedStore.affiliate_disclosure}</p>
              )}
            </div>
          )}
          {selectedStore && !shopUrl && selectedStore.integration_type === 'affiliate_deeplink' && selectedStore.website_url && (
            <a href={selectedStore.website_url} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, textDecoration: 'none' }}>
              Shop at {selectedStore.name}
            </a>
          )}
          {selectedStore && !shopUrl && selectedStore.integration_type === 'affiliate_deeplink' && !selectedStore.website_url && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No shopping link available for {selectedStore.name} yet.</p>
          )}
          {selectedStore && !shopUrl && selectedStore.integration_type !== 'affiliate_deeplink' && (
            <button onClick={() => exportMaterialsCsv(order, items, variant)} style={secondaryBtn}>
              {selectedStore.integration_type === 'placeholder' ? `Export for ${selectedStore.name} (CSV)` : 'Export list (CSV)'}
            </button>
          )}
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save order'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
