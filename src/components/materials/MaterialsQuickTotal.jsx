import { useState, useEffect, useRef } from 'react'
import { GRADES, money, gradeTotal } from '../../lib/materialsView'
import './materialsFlow.css'

// Display-only count-up (~500ms), reduced-motion aware.
function useCountUp(value, duration = 500) {
  const [n, setN] = useState(Number(value) || 0)
  const fromRef = useRef(Number(value) || 0)
  const raf = useRef(null)
  useEffect(() => {
    const target = Number(value) || 0
    const from = Number(fromRef.current) || 0
    if (from === target) { setN(target); return }
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { fromRef.current = target; setN(target); return }
    let start = null
    const step = (ts) => {
      if (start == null) start = ts
      const p = Math.min(1, (ts - start) / duration)
      const e = 1 - Math.pow(1 - p, 3)
      setN(from + (target - from) * e)
      if (p < 1) raf.current = requestAnimationFrame(step)
      else fromRef.current = target
    }
    raf.current = requestAnimationFrame(step)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, duration])
  return n
}

const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const primaryBtn = { ...btn, border: 'none', background: 'var(--color-primary)', color: 'var(--color-on-primary, #fff)' }

export default function MaterialsQuickTotal({ lines, grade, onGradeChange, maxPriceAsOf, estimateEntry, saving, onSave, onReview, onBack }) {
  const selectedTotal = gradeTotal(lines, grade)
  const animated = useCountUp(selectedTotal)

  return (
    <div className="mf-fadein" style={{ maxWidth: 620, margin: '24px auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {GRADES.map(g => {
          const active = grade === g.key
          return (
            <button
              key={g.key}
              onClick={() => onGradeChange(g.key)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                background: 'var(--color-surface)', textAlign: 'left',
                border: active ? '2px solid #F27243' : '1px solid var(--color-border)',
                boxShadow: active ? '0 0 0 1px #F27243' : 'none',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>{g.label}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text, #1b2426)', fontVariantNumeric: 'tabular-nums' }}>{money(gradeTotal(lines, g.key))}</span>
            </button>
          )
        })}
      </div>

      <div style={{ textAlign: 'center', margin: '8px 0 6px' }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--color-text, #1b2426)', fontVariantNumeric: 'tabular-nums' }}>{money(animated)}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{GRADES.find(g => g.key === grade)?.label} · {lines.length} item{lines.length === 1 ? '' : 's'}</div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
        Estimated from your measurements and current catalog prices, as of {maxPriceAsOf || '—'}. Verify with your supplier.
      </p>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }} onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : (estimateEntry ? 'Attach to this estimate' : 'Save as materials order')}
        </button>
        <button style={btn} onClick={onReview}>Review item by item</button>
        <button style={btn} onClick={onBack}>Back</button>
      </div>
    </div>
  )
}
