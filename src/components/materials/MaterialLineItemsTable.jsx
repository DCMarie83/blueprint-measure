import { useState, useEffect } from 'react'
import { isCoverageLine } from '../../utils/measurements'
import './materialsFlow.css'

// Display order is fixed: Premium, Standard, Commercial.
const GRADES = [
  { key: 'premium', label: 'Premium' },
  { key: 'standard', label: 'Standard' },
  { key: 'commercial', label: 'Commercial' },
]

const cellInput = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)', fontSize: 13,
}
const th = { padding: '8px 8px', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, background: 'rgba(38,70,76,0.06)', borderBottom: '1px solid var(--color-border)' }
const td = { padding: '8px 8px', verticalAlign: 'top' }
const gradeChip = (active) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700, background: active ? '#F27243' : 'rgba(38,70,76,0.12)', color: active ? '#fff' : '#26464C' })
const miniLabel = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--color-text-muted)' }
const myPriceTag = { fontSize: 10, fontWeight: 600, color: 'var(--color-primary, #26464c)', whiteSpace: 'nowrap' }

// A grade cost is a "My price" when it was resolved from this company's override
// for the catalog row behind that grade (id present + override equals the cost).
function isMyPrice(item, gradeKey, overrideMap) {
  const id = item[`catalog_item_${gradeKey}_id`]
  if (!id || !overrideMap || !overrideMap.has(id)) return false
  const cost = item[`cost_${gradeKey}`]
  if (cost === '' || cost == null) return false
  return Number(overrideMap.get(id)) === Number(cost)
}

function useIsNarrow(breakpoint = 820) {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  )
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return narrow
}

export default function MaterialLineItemsTable({ items, onUpdate, onRemove, readOnly = false, overrideMap, selectedGrade }) {
  const narrow = useIsNarrow()
  const overrides = overrideMap || new Map()

  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '16px 0' }}>
        No line items yet. Use "Suggest from measurements" to pull paint quantities from this job's
        zones, "Rebuild from estimate" when an estimate is linked, or add a line manually.
      </p>
    )
  }

  if (narrow) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(it => {
          const coverage = isCoverageLine(it)
          return (
            <div key={it.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14, background: 'var(--color-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <input style={{ ...cellInput, fontWeight: 600 }} placeholder="Description" value={it.description} disabled={readOnly} onChange={e => onUpdate(it.id, { description: e.target.value })} />
                {!readOnly && (
                  <button onClick={() => onRemove(it.id)} style={{ background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', fontSize: 13, padding: '6px 4px', whiteSpace: 'nowrap' }}>Remove</button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                <label style={miniLabel}>Unit<input style={cellInput} placeholder="gallon" value={it.unit} disabled={readOnly} onChange={e => onUpdate(it.id, { unit: e.target.value })} /></label>
                <label style={miniLabel}>Qty<input style={cellInput} type="number" step="0.25" value={it.quantity} disabled={readOnly} onChange={e => onUpdate(it.id, { quantity: e.target.value })} /></label>
                <label style={miniLabel}>Coats<input style={{ ...cellInput, opacity: coverage ? 1 : 0.5 }} type="number" min="1" max="5" step="1" value={coverage ? it.coats : 1} disabled={readOnly || !coverage} title={coverage ? 'Coats (1–5)' : 'Coats apply to paint (gallon) lines only'} onChange={e => onUpdate(it.id, { coats: e.target.value })} /></label>
                <label style={miniLabel}>Overage %<input style={cellInput} type="number" step="1" value={it.overage_pct} disabled={readOnly} onChange={e => onUpdate(it.id, { overage_pct: e.target.value })} /></label>
              </div>
              {it.source_zone_name ? (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>From: {it.source_zone_name}</div>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {GRADES.map(g => {
                  const myPrice = isMyPrice(it, g.key, overrides)
                  return (
                    <div key={g.key} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>{g.label}</span>
                        {myPrice && <span style={myPriceTag}>My price</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                        <input style={cellInput} placeholder="Product" value={it[`product_${g.key}`]} disabled={readOnly} onChange={e => onUpdate(it.id, { [`product_${g.key}`]: e.target.value })} />
                        <input style={cellInput} type="number" step="0.01" placeholder="Cost" value={it[`cost_${g.key}`]} disabled={readOnly} onChange={e => onUpdate(it.id, { [`cost_${g.key}`]: e.target.value })} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: 12 }}>
            <th style={th}>Description</th>
            <th style={th}>Source</th>
            <th style={{ ...th, width: 80 }}>Unit</th>
            <th style={{ ...th, width: 80 }}>Qty</th>
            <th style={{ ...th, width: 70 }}>Coats</th>
            <th style={{ ...th, width: 90 }}>Overage %</th>
            <th style={th}><span style={gradeChip(selectedGrade === 'premium')}>Premium</span></th>
            <th style={th}><span style={gradeChip(selectedGrade === 'standard')}>Standard</span></th>
            <th style={th}><span style={gradeChip(selectedGrade === 'commercial')}>Commercial</span></th>
            <th style={{ ...th, width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => {
            const coverage = isCoverageLine(it)
            return (
              <tr key={it.id} className="mf-zebra" style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={td}><input style={cellInput} placeholder="Description" value={it.description} disabled={readOnly} onChange={e => onUpdate(it.id, { description: e.target.value })} /></td>
                <td style={{ ...td, color: 'var(--color-text-muted)', fontSize: 12, maxWidth: 160 }}>{it.source_zone_name || '—'}</td>
                <td style={td}><input style={cellInput} placeholder="gallon" value={it.unit} disabled={readOnly} onChange={e => onUpdate(it.id, { unit: e.target.value })} /></td>
                <td style={td}><input style={cellInput} type="number" step="0.25" value={it.quantity} disabled={readOnly} onChange={e => onUpdate(it.id, { quantity: e.target.value })} /></td>
                <td style={td}><input style={{ ...cellInput, opacity: coverage ? 1 : 0.5 }} type="number" min="1" max="5" step="1" value={coverage ? it.coats : 1} disabled={readOnly || !coverage} title={coverage ? 'Coats (1–5)' : 'Coats apply to paint (gallon) lines only'} onChange={e => onUpdate(it.id, { coats: e.target.value })} /></td>
                <td style={td}><input style={cellInput} type="number" step="1" value={it.overage_pct} disabled={readOnly} onChange={e => onUpdate(it.id, { overage_pct: e.target.value })} /></td>
                {GRADES.map(g => {
                  const myPrice = isMyPrice(it, g.key, overrides)
                  return (
                    <td key={g.key} style={td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input style={cellInput} placeholder="Product" value={it[`product_${g.key}`]} disabled={readOnly} onChange={e => onUpdate(it.id, { [`product_${g.key}`]: e.target.value })} />
                        <input style={cellInput} type="number" step="0.01" placeholder="Cost" value={it[`cost_${g.key}`]} disabled={readOnly} onChange={e => onUpdate(it.id, { [`cost_${g.key}`]: e.target.value })} />
                        {myPrice && <span style={myPriceTag}>My price</span>}
                      </div>
                    </td>
                  )
                })}
                <td style={{ ...td, textAlign: 'center' }}>
                  {!readOnly && (
                    <button onClick={() => onRemove(it.id)} title="Remove line" style={{ background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
