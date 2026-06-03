import { useState, useEffect } from 'react'

const TIERS = [
  { key: 'good', label: 'Good' },
  { key: 'better', label: 'Better' },
  { key: 'best', label: 'Best' },
]

const cellInput = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)', fontSize: 13,
}
const th = { padding: '8px 8px', fontWeight: 600, whiteSpace: 'nowrap' }
const td = { padding: '8px 8px', verticalAlign: 'top' }
const miniLabel = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--color-text-muted)' }

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

export default function MaterialLineItemsTable({ items, onUpdate, onRemove, readOnly = false }) {
  const narrow = useIsNarrow()

  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '16px 0' }}>
        No line items yet. Use "Suggest from measurements" to pull paint quantities from this job, or add a line manually.
      </p>
    )
  }

  if (narrow) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(it => (
          <div key={it.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14, background: 'var(--color-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
              <input style={{ ...cellInput, fontWeight: 600 }} placeholder="Description" value={it.description} disabled={readOnly} onChange={e => onUpdate(it.id, { description: e.target.value })} />
              {!readOnly && (
                <button onClick={() => onRemove(it.id)} style={{ background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', fontSize: 13, padding: '6px 4px', whiteSpace: 'nowrap' }}>Remove</button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
              <label style={miniLabel}>Unit<input style={cellInput} placeholder="gallon" value={it.unit} disabled={readOnly} onChange={e => onUpdate(it.id, { unit: e.target.value })} /></label>
              <label style={miniLabel}>Qty<input style={cellInput} type="number" step="0.25" value={it.quantity} disabled={readOnly} onChange={e => onUpdate(it.id, { quantity: e.target.value })} /></label>
              <label style={miniLabel}>Overage %<input style={cellInput} type="number" step="1" value={it.overage_pct} disabled={readOnly} onChange={e => onUpdate(it.id, { overage_pct: e.target.value })} /></label>
            </div>
            {it.source_zone_name ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>From: {it.source_zone_name}</div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TIERS.map(t => (
                <div key={t.key} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>{t.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                    <input style={cellInput} placeholder="Product" value={it[`product_${t.key}`]} disabled={readOnly} onChange={e => onUpdate(it.id, { [`product_${t.key}`]: e.target.value })} />
                    <input style={cellInput} type="number" step="0.01" placeholder="Cost" value={it[`cost_${t.key}`]} disabled={readOnly} onChange={e => onUpdate(it.id, { [`cost_${t.key}`]: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
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
            <th style={{ ...th, width: 90 }}>Overage %</th>
            <th style={th}>Good</th>
            <th style={th}>Better</th>
            <th style={th}>Best</th>
            <th style={{ ...th, width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id} style={{ borderTop: '1px solid var(--color-border)' }}>
              <td style={td}><input style={cellInput} placeholder="Description" value={it.description} disabled={readOnly} onChange={e => onUpdate(it.id, { description: e.target.value })} /></td>
              <td style={{ ...td, color: 'var(--color-text-muted)', fontSize: 12, maxWidth: 160 }}>{it.source_zone_name || '—'}</td>
              <td style={td}><input style={cellInput} placeholder="gallon" value={it.unit} disabled={readOnly} onChange={e => onUpdate(it.id, { unit: e.target.value })} /></td>
              <td style={td}><input style={cellInput} type="number" step="0.25" value={it.quantity} disabled={readOnly} onChange={e => onUpdate(it.id, { quantity: e.target.value })} /></td>
              <td style={td}><input style={cellInput} type="number" step="1" value={it.overage_pct} disabled={readOnly} onChange={e => onUpdate(it.id, { overage_pct: e.target.value })} /></td>
              {TIERS.map(t => (
                <td key={t.key} style={td}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input style={cellInput} placeholder="Product" value={it[`product_${t.key}`]} disabled={readOnly} onChange={e => onUpdate(it.id, { [`product_${t.key}`]: e.target.value })} />
                    <input style={cellInput} type="number" step="0.01" placeholder="Cost" value={it[`cost_${t.key}`]} disabled={readOnly} onChange={e => onUpdate(it.id, { [`cost_${t.key}`]: e.target.value })} />
                  </div>
                </td>
              ))}
              <td style={{ ...td, textAlign: 'center' }}>
                {!readOnly && (
                  <button onClick={() => onRemove(it.id)} title="Remove line" style={{ background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
