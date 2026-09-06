import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { trackMaterials } from '../../lib/analytics'
import { ScrollbarInside } from '../common/FloatingScrollbar'

const GRADE_ORDER = { premium: 0, standard: 1, commercial: 2 }

function humanizeSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const input = {
  padding: '6px 8px', fontSize: 13, border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)',
  width: 110, boxSizing: 'border-box',
}
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', fontSize: 13, verticalAlign: 'middle' }
const btn = { padding: '5px 12px', fontSize: 12, fontWeight: 600, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', cursor: 'pointer' }

export default function MaterialsPricingTab() {
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()
  const [rows, setRows] = useState([])
  const [stores, setStores] = useState([])
  const [prices, setPrices] = useState({})      // catalog_item_id -> input string
  const [savedPrices, setSavedPrices] = useState({}) // catalog_item_id -> persisted number
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingId, setSavingId] = useState(null)

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    const [{ data: catRows, error: catErr }, { data: storeRows }, { data: priceRows, error: priceErr }] = await Promise.all([
      supabase.from('materials_catalog').select('*').eq('trade_vertical', 'painting').eq('is_active', true)
        .order('display_order', { ascending: true }),
      supabase.from('stores').select('id, name'),
      supabase.from('company_material_prices').select('catalog_item_id, price').eq('company_id', companyId),
    ])
    if (catErr) setError(catErr.message)
    if (priceErr) setError(priceErr.message)
    setRows(catRows ?? [])
    setStores(storeRows ?? [])
    const saved = {}
    const inputs = {}
    for (const p of (priceRows ?? [])) {
      saved[p.catalog_item_id] = Number(p.price)
      inputs[p.catalog_item_id] = String(p.price)
    }
    setSavedPrices(saved)
    setPrices(inputs)
    setLoading(false)
  }, [companyId])

  useEffect(() => { load() }, [load])

  const storeName = (id) => stores.find(s => s.id === id)?.name || null

  // Group active rows by taxonomy_slug, grades ordered premium/standard/commercial.
  const groups = []
  const bySlug = new Map()
  for (const r of rows) {
    if (!bySlug.has(r.taxonomy_slug)) {
      const g = { slug: r.taxonomy_slug, rows: [] }
      bySlug.set(r.taxonomy_slug, g)
      groups.push(g)
    }
    bySlug.get(r.taxonomy_slug).rows.push(r)
  }
  for (const g of groups) g.rows.sort((a, b) => (GRADE_ORDER[a.grade] ?? 9) - (GRADE_ORDER[b.grade] ?? 9))

  const maxPriceAsOf = rows.reduce((max, r) => (r.price_as_of && (!max || r.price_as_of > max) ? r.price_as_of : max), null)

  async function savePrice(row) {
    if (!companyId) return
    const raw = (prices[row.id] ?? '').trim()
    setSavingId(row.id)
    setError(null)
    try {
      if (raw === '') {
        // Cleared -> delete the override row.
        const { error: err } = await supabase
          .from('company_material_prices')
          .delete()
          .eq('company_id', companyId)
          .eq('catalog_item_id', row.id)
        if (err) throw err
        setSavedPrices(prev => { const n = { ...prev }; delete n[row.id]; return n })
      } else {
        const price = Number(raw)
        if (!Number.isFinite(price) || price < 0) throw new Error(t('materials:pricing.priceError'))
        const { error: err } = await supabase
          .from('company_material_prices')
          .upsert({ company_id: companyId, catalog_item_id: row.id, price }, { onConflict: 'company_id,catalog_item_id' })
        if (err) throw err
        setSavedPrices(prev => ({ ...prev, [row.id]: price }))
      }
      trackMaterials('my_price_set', { companyId, catalog_item_id: row.id })
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <div style={{ color: 'var(--color-text-muted)', padding: 20 }}>{t('materials:pricing.loading')}</div>

  return (
    <div style={{ padding: '4px 0 40px' }}>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 16px', maxWidth: 720, lineHeight: 1.5 }}>
        {t('materials:pricing.intro', { date: maxPriceAsOf || '—' })}
      </p>

      {error && (
        <div style={{ background: 'var(--color-danger-bg, #fef2f2)', color: 'var(--color-danger, #dc2626)', border: '1px solid var(--color-danger, #dc2626)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

      {groups.length === 0 ? (
        <div style={{ color: 'var(--color-text-muted)', padding: 20 }}>{t('materials:pricing.empty')}</div>
      ) : groups.map(group => (
        <div key={group.slug} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: 14 }}>
            {humanizeSlug(group.slug)}
          </div>
          <div style={{ overflowX: 'auto' }}><ScrollbarInside />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{t('materials:pricing.colItem')}</th>
                  <th style={th}>{t('materials:pricing.colUnit')}</th>
                  <th style={th}>{t('materials:pricing.colTypical')}</th>
                  <th style={th}>{t('materials:pricing.colMyPrice')}</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map(row => {
                  const sn = storeName(row.store_id)
                  const hasOverride = savedPrices[row.id] != null
                  return (
                    <tr key={row.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{row.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {row.grade}{sn ? ` · ${sn}` : ''}
                        </div>
                      </td>
                      <td style={td}>{row.purchase_unit}</td>
                      <td style={td}>{row.typical_price != null ? `$${Number(row.typical_price).toFixed(2)}` : '—'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            style={input}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="—"
                            value={prices[row.id] ?? ''}
                            onChange={e => setPrices(prev => ({ ...prev, [row.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') savePrice(row) }}
                          />
                          {hasOverride && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-primary, #26464c)' }}>{t('materials:pricing.myPriceTag')}</span>}
                        </div>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <button style={btn} disabled={savingId === row.id} onClick={() => savePrice(row)}>
                          {savingId === row.id ? t('materials:summary.saving') : t('common:action.save')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
