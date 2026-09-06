import { useState, useEffect, useCallback, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import ItemVisual from '../../components/materials/ItemVisual'
import { ScrollbarInside } from '../../components/common/FloatingScrollbar'

// Super-admin catalog manager for materials_catalog. Route lives under
// /admin (AdminRoute already gates super-admin); RLS enforces is_super_admin on
// every write. Deactivate is the primary removal path — hard delete is avoided
// because order lines reference catalog rows via provenance ids.

const GRADES = ['premium', 'standard', 'commercial']
const PURCHASE_UNITS = ['gallon', 'quart', 'each', 'box', 'bag', 'roll', 'tube', 'pack', 'pair', 'kit', 'sf', 'lf']
const QUANTITY_RULES = ['coverage', 'per_area', 'per_count', 'per_job', 'manual']

const EDITABLE_FIELDS = [
  'taxonomy_slug', 'name', 'trade_vertical', 'grade', 'store_id', 'retailer_product_id',
  'product_url', 'image_url', 'purchase_unit', 'quantity_rule', 'coverage_sf_per_unit', 'qty_per_1000sf',
  'qty_per_count', 'qty_per_job', 'typical_price', 'price_as_of', 'is_active', 'display_order', 'notes',
]

const NUMERIC_FIELDS = new Set([
  'coverage_sf_per_unit', 'qty_per_1000sf', 'qty_per_count', 'qty_per_job', 'typical_price', 'display_order',
])

const input = {
  padding: '6px 8px', fontSize: 13, border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)',
  boxSizing: 'border-box', width: '100%',
}
const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', fontSize: 13, verticalAlign: 'middle' }
const btn = { padding: '6px 12px', fontSize: 13, fontWeight: 600, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', cursor: 'pointer' }
const primaryBtn = { ...btn, background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)', border: 'none' }

function blankRow() {
  return {
    taxonomy_slug: '', name: '', trade_vertical: 'painting', grade: 'standard', store_id: '',
    retailer_product_id: '', product_url: '', image_url: '', purchase_unit: 'gallon', quantity_rule: 'manual',
    coverage_sf_per_unit: '', qty_per_1000sf: '', qty_per_count: '', qty_per_job: '',
    typical_price: '', price_as_of: '', is_active: true, display_order: 0, notes: '',
  }
}

// Convert a form-state value into a DB-ready value for a given field.
function toDbValue(field, value) {
  if (field === 'is_active') return !!value
  if (field === 'store_id') return value || null
  if (field === 'price_as_of') return value || null
  if (NUMERIC_FIELDS.has(field)) {
    if (value === '' || value == null) return field === 'display_order' ? 0 : null
    return Number(value)
  }
  return value === '' ? (field === 'trade_vertical' ? 'painting' : (['taxonomy_slug', 'name', 'grade', 'purchase_unit', 'quantity_rule'].includes(field) ? value : null)) : value
}

// Convert a DB row into editable form state (nulls -> '').
function toFormState(row) {
  const out = {}
  for (const f of EDITABLE_FIELDS) {
    if (f === 'is_active') out[f] = row.is_active ?? true
    else out[f] = row[f] == null ? '' : row[f]
  }
  return out
}

function ruleSummary(row) {
  switch (row.quantity_rule) {
    case 'coverage': return `coverage · ${row.coverage_sf_per_unit ?? '—'} sf/unit`
    case 'per_area': return `per_area · ${row.qty_per_1000sf ?? '—'}/1000sf`
    case 'per_count': return `per_count · ${row.qty_per_count ?? '—'}`
    case 'per_job': return `per_job · ${row.qty_per_job ?? '—'}`
    default: return 'manual'
  }
}

export default function MaterialsCatalogSection() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(null)

  const [filters, setFilters] = useState({ vertical: 'all', grade: 'all', store: 'all', active: 'active' })

  const [expandedId, setExpandedId] = useState(null)
  const [editState, setEditState] = useState({})

  const [creating, setCreating] = useState(false)
  const [createState, setCreateState] = useState(blankRow())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: catRows, error: catErr }, { data: storeRows }] = await Promise.all([
      supabase.from('materials_catalog').select('*').order('taxonomy_slug', { ascending: true }).order('display_order', { ascending: true }),
      supabase.from('stores').select('id, name').order('sort_order', { ascending: true }),
    ])
    if (catErr) setError(catErr.message)
    setRows(catRows ?? [])
    setStores(storeRows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const storeName = (id) => stores.find(s => s.id === id)?.name || '—'

  const verticals = ['all', ...Array.from(new Set(rows.map(r => r.trade_vertical).filter(Boolean)))]

  const filtered = rows.filter(r => {
    if (filters.vertical !== 'all' && r.trade_vertical !== filters.vertical) return false
    if (filters.grade !== 'all' && r.grade !== filters.grade) return false
    if (filters.store !== 'all') {
      if (filters.store === 'none' && r.store_id) return false
      if (filters.store !== 'none' && r.store_id !== filters.store) return false
    }
    if (filters.active === 'active' && !r.is_active) return false
    if (filters.active === 'inactive' && r.is_active) return false
    return true
  })

  function startEdit(row) {
    setExpandedId(row.id)
    setEditState(toFormState(row))
  }

  function patchEdit(field, value) {
    setEditState(prev => ({ ...prev, [field]: value }))
  }

  async function saveEdit(id) {
    setSaving(id)
    setError(null)
    const patch = {}
    for (const f of EDITABLE_FIELDS) patch[f] = toDbValue(f, editState[f])
    patch.updated_at = new Date().toISOString()
    const { error: err } = await supabase.from('materials_catalog').update(patch).eq('id', id)
    if (err) { setError(err.message); setSaving(null); return }
    setSaving(null)
    setExpandedId(null)
    await load()
  }

  async function setActive(row, active) {
    setSaving(row.id)
    const { error: err } = await supabase
      .from('materials_catalog')
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (err) setError(err.message)
    setSaving(null)
    await load()
  }

  async function createRow(e) {
    e.preventDefault()
    if (!createState.taxonomy_slug.trim() || !createState.name.trim()) {
      setError(t('admin:materialsCatalog.slugNameRequired'))
      return
    }
    setSaving('new')
    setError(null)
    const payload = {}
    for (const f of EDITABLE_FIELDS) payload[f] = toDbValue(f, createState[f])
    const { error: err } = await supabase.from('materials_catalog').insert(payload)
    if (err) { setError(err.message); setSaving(null); return }
    setSaving(null)
    setCreating(false)
    setCreateState(blankRow())
    await load()
  }

  function renderFieldEditor(state, patch) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label style={label}>taxonomy_slug<input style={input} value={state.taxonomy_slug} onChange={e => patch('taxonomy_slug', e.target.value)} placeholder="paint-wall-interior" /></label>
        <label style={label}>name<input style={input} value={state.name} onChange={e => patch('name', e.target.value)} /></label>
        <label style={label}>trade_vertical<input style={input} value={state.trade_vertical} onChange={e => patch('trade_vertical', e.target.value)} /></label>
        <label style={label}>grade
          <select style={input} value={state.grade} onChange={e => patch('grade', e.target.value)}>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label style={label}>store
          <select style={input} value={state.store_id || ''} onChange={e => patch('store_id', e.target.value)}>
            <option value="">— none —</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label style={label}>purchase_unit
          <select style={input} value={state.purchase_unit} onChange={e => patch('purchase_unit', e.target.value)}>
            {PURCHASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label style={label}>quantity_rule
          <select style={input} value={state.quantity_rule} onChange={e => patch('quantity_rule', e.target.value)}>
            {QUANTITY_RULES.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </label>
        <label style={label}>coverage_sf_per_unit<input style={input} type="number" step="0.01" value={state.coverage_sf_per_unit} onChange={e => patch('coverage_sf_per_unit', e.target.value)} /></label>
        <label style={label}>qty_per_1000sf<input style={input} type="number" step="0.01" value={state.qty_per_1000sf} onChange={e => patch('qty_per_1000sf', e.target.value)} /></label>
        <label style={label}>qty_per_count<input style={input} type="number" step="0.01" value={state.qty_per_count} onChange={e => patch('qty_per_count', e.target.value)} /></label>
        <label style={label}>qty_per_job<input style={input} type="number" step="0.01" value={state.qty_per_job} onChange={e => patch('qty_per_job', e.target.value)} /></label>
        <label style={label}>typical_price<input style={input} type="number" step="0.01" value={state.typical_price} onChange={e => patch('typical_price', e.target.value)} /></label>
        <label style={label}>price_as_of<input style={input} type="date" value={state.price_as_of || ''} onChange={e => patch('price_as_of', e.target.value)} /></label>
        <label style={label}>display_order<input style={input} type="number" step="1" value={state.display_order} onChange={e => patch('display_order', e.target.value)} /></label>
        <label style={label}>retailer_product_id<input style={input} value={state.retailer_product_id} onChange={e => patch('retailer_product_id', e.target.value)} /></label>
        <label style={label}>product_url<input style={input} value={state.product_url} onChange={e => patch('product_url', e.target.value)} /></label>
        <label style={{ ...label, gridColumn: '1 / -1' }}>{t('admin:materialsCatalog.imageUrl')}
          <input style={input} value={state.image_url || ''} onChange={e => patch('image_url', e.target.value)} placeholder="https://…" />
          <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>{t('admin:materialsCatalog.imageUrlHelp')}</span>
        </label>
        <label style={{ ...label, gridColumn: '1 / -1' }}>notes<input style={input} value={state.notes} onChange={e => patch('notes', e.target.value)} /></label>
        <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={!!state.is_active} onChange={e => patch('is_active', e.target.checked)} /> is_active
        </label>
      </div>
    )
  }

  return (
    <div style={{ padding: '4px 4px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{t('admin:materialsCatalog.title')}</h1>
        <button style={primaryBtn} onClick={() => { setCreating(c => !c); setCreateState(blankRow()) }}>
          {creating ? t('common:action.close') : t('admin:materialsCatalog.newItem')}
        </button>
      </div>

      {error && (
        <div style={{ background: 'var(--color-danger-bg, #fef2f2)', color: 'var(--color-danger, #dc2626)', border: '1px solid var(--color-danger, #dc2626)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>
      )}

      {creating && (
        <form onSubmit={createRow} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 20, background: 'var(--color-surface)' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{t('admin:materialsCatalog.newItemHeading')}</h3>
          {renderFieldEditor(createState, (f, v) => setCreateState(prev => ({ ...prev, [f]: v })))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button type="button" style={btn} onClick={() => { setCreating(false); setCreateState(blankRow()) }}>{t('common:action.cancel')}</button>
            <button type="submit" style={primaryBtn} disabled={saving === 'new'}>{saving === 'new' ? t('admin:materialsCatalog.creating') : t('admin:materialsCatalog.create')}</button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={label}>{t('admin:materialsCatalog.filterVertical')}
          <select style={input} value={filters.vertical} onChange={e => setFilters(f => ({ ...f, vertical: e.target.value }))}>
            {verticals.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label style={label}>{t('admin:materialsCatalog.filterGrade')}
          <select style={input} value={filters.grade} onChange={e => setFilters(f => ({ ...f, grade: e.target.value }))}>
            <option value="all">all</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label style={label}>{t('admin:materialsCatalog.filterStore')}
          <select style={input} value={filters.store} onChange={e => setFilters(f => ({ ...f, store: e.target.value }))}>
            <option value="all">all</option>
            <option value="none">— none —</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label style={label}>{t('admin:materialsCatalog.filterState')}
          <select style={input} value={filters.active} onChange={e => setFilters(f => ({ ...f, active: e.target.value }))}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="all">all</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', padding: 20 }}>{t('admin:materialsCatalog.loading')}</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}><ScrollbarInside />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={th}>{t('admin:materialsCatalog.colSlug')}</th>
                <th style={th}>{t('admin:materialsCatalog.colName')}</th>
                <th style={th}>{t('admin:materialsCatalog.colGrade')}</th>
                <th style={th}>{t('admin:materialsCatalog.colStore')}</th>
                <th style={th}>{t('admin:materialsCatalog.colUnit')}</th>
                <th style={th}>{t('admin:materialsCatalog.colRule')}</th>
                <th style={th}>{t('admin:materialsCatalog.colTypical')}</th>
                <th style={th}>{t('admin:materialsCatalog.colAsOf')}</th>
                <th style={th}>{t('admin:materialsCatalog.colUrl')}</th>
                <th style={th}>{t('admin:materialsCatalog.colActive')}</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td style={td} colSpan={11}><span style={{ color: 'var(--color-text-muted)' }}>{t('admin:materialsCatalog.empty')}</span></td></tr>
              ) : filtered.map(row => (
                <Fragment key={row.id}>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', opacity: row.is_active ? 1 : 0.55 }}>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <ItemVisual imageUrl={row.image_url} taxonomySlug={row.taxonomy_slug} quantityRule={row.quantity_rule} size={28} />
                        {row.taxonomy_slug}
                      </span>
                    </td>
                    <td style={td}>{row.name}</td>
                    <td style={td}>{row.grade}</td>
                    <td style={td}>{storeName(row.store_id)}</td>
                    <td style={td}>{row.purchase_unit}</td>
                    <td style={td}>{ruleSummary(row)}</td>
                    <td style={td}>{row.typical_price != null ? `$${Number(row.typical_price).toFixed(2)}` : '—'}</td>
                    <td style={td}>{row.price_as_of || '—'}</td>
                    <td style={td}>{row.product_url ? <a href={row.product_url} target="_blank" rel="noopener noreferrer">{t('admin:materialsCatalog.link')}</a> : '—'}</td>
                    <td style={td}>{row.is_active ? t('admin:materialsCatalog.yes') : t('admin:materialsCatalog.no')}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button style={btn} onClick={() => (expandedId === row.id ? setExpandedId(null) : startEdit(row))}>
                        {expandedId === row.id ? t('common:action.close') : t('common:action.edit')}
                      </button>{' '}
                      {row.is_active ? (
                        <button style={btn} disabled={saving === row.id} onClick={() => setActive(row, false)}>{t('admin:materialsCatalog.deactivate')}</button>
                      ) : (
                        <button style={btn} disabled={saving === row.id} onClick={() => setActive(row, true)}>{t('admin:materialsCatalog.reactivate')}</button>
                      )}
                    </td>
                  </tr>
                  {expandedId === row.id && (
                    <tr>
                      <td style={{ ...td, background: 'var(--color-surface)' }} colSpan={11}>
                        {renderFieldEditor(editState, patchEdit)}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                          <button type="button" style={btn} onClick={() => setExpandedId(null)}>{t('common:action.cancel')}</button>
                          <button type="button" style={primaryBtn} disabled={saving === row.id} onClick={() => saveEdit(row.id)}>{saving === row.id ? t('admin:materialsCatalog.saving') : t('common:action.save')}</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
