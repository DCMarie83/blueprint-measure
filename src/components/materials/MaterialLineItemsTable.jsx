import { useState } from 'react'
import { isCoverageLine } from '../../utils/measurements'
import { GRADES, money, gradeTotal, categoryForLine, itemVisualProps } from '../../lib/materialsView'
import ItemVisual from './ItemVisual'
import './materialsFlow.css'

const cellInput = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)', fontSize: 13,
}
const myPriceTag = { fontSize: 10, fontWeight: 600, color: 'var(--color-primary, #26464c)', whiteSpace: 'nowrap' }
const gradePill = (active) => ({
  padding: '5px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
  color: active ? 'var(--color-on-primary, #fff)' : 'var(--color-text, #1b2426)',
})
const stepBtn = { width: 24, height: 28, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', borderRadius: 'var(--radius-sm)', fontSize: 15, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }

// A grade cost is a "My price" when it was resolved from this company's override
// for the catalog row behind that grade (id present + override equals the cost).
function isMyPrice(item, gradeKey, overrideMap) {
  const id = item[`catalog_item_${gradeKey}_id`]
  if (!id || !overrideMap || !overrideMap.has(id)) return false
  const cost = item[`cost_${gradeKey}`]
  if (cost === '' || cost == null) return false
  return Number(overrideMap.get(id)) === Number(cost)
}

// Compact numeric stepper: −/+ around a small number input.
function Stepper({ label, value, onChange, min = 0, max, step = 1, disabled, title }) {
  const num = Number(value) || 0
  const set = (v) => {
    let n = Math.round(v * 100) / 100
    if (min != null && n < min) n = min
    if (max != null && n > max) n = max
    onChange(String(n))
  }
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--color-text-muted)' }} title={title}>
      {label}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: disabled ? 0.5 : 1 }}>
        <button type="button" style={stepBtn} disabled={disabled} onClick={() => set(num - step)} tabIndex={-1}>−</button>
        <input
          style={{ ...cellInput, width: 56, textAlign: 'center', padding: '6px 4px' }}
          type="number" step={step} min={min} max={max} value={value}
          disabled={disabled} onChange={e => onChange(e.target.value)}
        />
        <button type="button" style={stepBtn} disabled={disabled} onClick={() => set(num + step)} tabIndex={-1}>+</button>
      </span>
    </label>
  )
}

// Per-grade product + cost detail (used by the All-grades expander).
function GradeDetail({ it, gradeKey, label, readOnly, overrides, onUpdate }) {
  const myPrice = isMyPrice(it, gradeKey, overrides)
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>{label}</span>
        {myPrice && <span style={myPriceTag}>● My price</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <input style={cellInput} placeholder="Product" value={it[`product_${gradeKey}`] ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { [`product_${gradeKey}`]: e.target.value })} />
        <input style={cellInput} type="number" step="0.01" placeholder="Cost" value={it[`cost_${gradeKey}`] ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { [`cost_${gradeKey}`]: e.target.value })} />
      </div>
    </div>
  )
}

function LineRow({ it, selectedGrade, readOnly, overrides, lookups, onUpdate, onRemove }) {
  const [open, setOpen] = useState(false)
  const coverage = isCoverageLine(it)
  const selLabel = GRADES.find(g => g.key === selectedGrade)?.label || 'Standard'
  const myPriceSel = isMyPrice(it, selectedGrade, overrides)

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '12px 8px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ItemVisual {...itemVisualProps(it, lookups)} size={44} />

        {/* Name + source */}
        <div style={{ flex: '2 1 200px', minWidth: 180 }}>
          <input style={{ ...cellInput, fontWeight: 600 }} placeholder="Description" value={it.description ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { description: e.target.value })} />
          {it.source_zone_name && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>From {it.source_zone_name}</div>}
          <div style={{ marginTop: 6 }}>
            <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--color-text-muted)', maxWidth: 110 }}>
              Unit<input style={cellInput} placeholder="gallon" value={it.unit ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { unit: e.target.value })} />
            </label>
          </div>
        </div>

        {/* Steppers */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Stepper label="Qty" value={it.quantity} step={0.25} min={0} disabled={readOnly} onChange={v => onUpdate(it.id, { quantity: v })} />
          <Stepper label="Coats" value={coverage ? it.coats : 1} step={1} min={1} max={5} disabled={readOnly || !coverage} title={coverage ? 'Coats (1–5)' : 'Coats apply to paint (gallon) lines only'} onChange={v => onUpdate(it.id, { coats: v })} />
          <Stepper label="Overage %" value={it.overage_pct} step={1} min={0} disabled={readOnly} onChange={v => onUpdate(it.id, { overage_pct: v })} />
        </div>

        {/* Selected grade — prominent */}
        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary, #26464c)' }}>{selLabel}</span>
            {myPriceSel && <span style={myPriceTag}>● My price</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <input style={cellInput} placeholder="Product" value={it[`product_${selectedGrade}`] ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { [`product_${selectedGrade}`]: e.target.value })} />
            <input style={cellInput} type="number" step="0.01" placeholder="Cost" value={it[`cost_${selectedGrade}`] ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { [`cost_${selectedGrade}`]: e.target.value })} />
          </div>
          <button type="button" onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #26464c)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 0 0' }}>
            {open ? 'Hide grades' : 'All grades'}
          </button>
        </div>

        {/* Delete */}
        {!readOnly && (
          <button onClick={() => onRemove(it.id)} title="Remove line" style={{ background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px 2px' }}>×</button>
        )}
      </div>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 10 }}>
          {GRADES.map(g => (
            <GradeDetail key={g.key} it={it} gradeKey={g.key} label={g.label} readOnly={readOnly} overrides={overrides} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function MaterialLineItemsTable({ items, onUpdate, onRemove, readOnly = false, overrideMap, selectedGrade = 'standard', lookups, onGradeChange, onExportCsv, onSave, saving }) {
  const overrides = overrideMap || new Map()

  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '16px 0' }}>
        No line items yet. Use "Suggest from measurements" to pull paint quantities from this job's
        zones, "Rebuild from estimate" when an estimate is linked, or add a line manually.
      </p>
    )
  }

  // Group into sections by category, preserving first-seen order.
  const sections = []
  const byCat = new Map()
  for (const it of items) {
    const cat = categoryForLine(it, lookups)
    if (!byCat.has(cat)) { const s = { category: cat, items: [] }; byCat.set(cat, s); sections.push(s) }
    byCat.get(cat).items.push(it)
  }

  const selLabel = GRADES.find(g => g.key === selectedGrade)?.label || 'Standard'

  return (
    <div>
      {sections.map(sec => (
        <div key={sec.category} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 8px', borderBottom: '2px solid rgba(38,70,76,0.16)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#26464C' }}>{sec.category}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>· {sec.items.length} item{sec.items.length === 1 ? '' : 's'}</span>
          </div>
          {sec.items.map(it => (
            <LineRow key={it.id} it={it} selectedGrade={selectedGrade} readOnly={readOnly} overrides={overrides} lookups={lookups} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
        </div>
      ))}

      {/* Sticky bottom summary bar */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 5, marginTop: 12,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 14px', borderTop: '1px solid var(--color-border)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        background: 'var(--color-surface)', boxShadow: '0 -4px 16px rgba(27,36,38,0.10)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text, #1b2426)' }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text, #1b2426)', fontVariantNumeric: 'tabular-nums' }}>
          Total at {selLabel} {money(gradeTotal(items, selectedGrade))}
        </span>

        {!readOnly && onGradeChange && (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {GRADES.map(g => (
              <button key={g.key} type="button" onClick={() => onGradeChange(g.key)} style={gradePill(selectedGrade === g.key)}>{g.label}</button>
            ))}
          </span>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onExportCsv && <button type="button" onClick={onExportCsv} style={{ ...gradePill(false), fontWeight: 600 }}>Export CSV</button>}
          {!readOnly && onSave && (
            <button type="button" onClick={onSave} disabled={saving} style={{
              padding: '8px 20px', borderRadius: 'var(--radius-md)', border: 'none', fontSize: 14, fontWeight: 700,
              background: 'linear-gradient(135deg, #F27243, #d95f33)', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Saving…' : 'Save order'}</button>
          )}
        </span>
      </div>
    </div>
  )
}
