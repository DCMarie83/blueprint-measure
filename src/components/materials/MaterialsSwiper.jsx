import { useState, useRef, useEffect } from 'react'
import { Check, X, ArrowLeft, ArrowRight, RotateCcw, PawPrint } from 'lucide-react'
import { GRADES, money, gradeTotal, lineCostAtGrade, materialBuyQuantity } from '../../lib/materialsView'
import './materialsFlow.css'

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  )
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduce
}

const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const heroBtn = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 'var(--radius-md)', border: 'none', background: 'linear-gradient(135deg, #F27243, #d95f33)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }
const gradeChip = (active) => ({ padding: '5px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: active ? '1px solid #F27243' : '1px solid var(--color-border)', background: active ? '#F27243' : 'var(--color-surface)', color: active ? '#fff' : 'var(--color-text, #1b2426)' })

function Card({ line, grade, style, className, overlay, dragHandlers }) {
  const buyQty = materialBuyQuantity(line)
  const others = GRADES.filter(g => g.key !== grade)
  return (
    <div
      {...(dragHandlers || {})}
      className={className}
      style={{
        position: 'absolute', inset: 0, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
        background: 'var(--color-surface)', boxShadow: '0 6px 20px rgba(27,36,38,0.10)', padding: 20,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', userSelect: 'none', touchAction: 'pan-y',
        ...style,
      }}
    >
      {overlay}
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text, #1b2426)' }}>{line.description || 'Untitled item'}</div>
        {line.source_zone_name && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>From {line.source_zone_name}</div>}
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10 }}>
          {buyQty} {line.unit || ''}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text, #1b2426)', fontVariantNumeric: 'tabular-nums' }}>
          {money(lineCostAtGrade(line, grade))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {others.map(g => (
            <span key={g.key} style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--color-surface-2, #eef0f0)', padding: '2px 8px', borderRadius: 9999 }}>
              {g.label} {money(lineCostAtGrade(line, g.key))}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MaterialsSwiper({ lines, grade, onGradeChange, storeName, saving, onSave, onEditDetails, onExportCsv, onReviewComplete }) {
  const reduce = usePrefersReducedMotion()
  const containerRef = useRef(null)
  const [decided, setDecided] = useState([]) // [{ id, decision }]
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [flingDir, setFlingDir] = useState(0) // -1 remove, 1 keep
  const startX = useRef(0)
  const completedRef = useRef(false)

  const n = lines.length
  const idx = decided.length
  const done = idx >= n
  const current = lines[idx]

  const kept = lines.filter(l => decided.find(d => d.id === l.id)?.decision === 'keep')

  useEffect(() => {
    if (done && n > 0 && !completedRef.current) {
      completedRef.current = true
      onReviewComplete?.({ kept: kept.length, removed: n - kept.length })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  function decide(decision) {
    if (!current) return
    setDecided(prev => [...prev, { id: current.id, decision }])
    setDragX(0)
    setFlingDir(0)
  }

  function commit(decision) {
    if (!current) return
    if (reduce) { decide(decision); return }
    setFlingDir(decision === 'keep' ? 1 : -1)
    setTimeout(() => decide(decision), 300)
  }

  function undo() {
    if (decided.length === 0) return
    setDecided(prev => prev.slice(0, -1))
    setDragX(0)
    setFlingDir(0)
  }

  // Keyboard bindings (always available).
  useEffect(() => {
    function onKey(e) {
      if (done || flingDir !== 0) return
      if (e.key === 'ArrowRight') commit('keep')
      else if (e.key === 'ArrowLeft') commit('remove')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, flingDir, idx, reduce])

  // Pointer drag (disabled under reduced motion).
  const dragHandlers = (reduce || flingDir !== 0) ? {} : {
    onPointerDown: (e) => { setIsDragging(true); startX.current = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId) },
    onPointerMove: (e) => { if (isDragging) setDragX(e.clientX - startX.current) },
    onPointerUp: () => {
      setIsDragging(false)
      const w = containerRef.current?.offsetWidth || 320
      const threshold = Math.min(120, w * 0.35)
      if (dragX > threshold) commit('keep')
      else if (dragX < -threshold) commit('remove')
      else setDragX(0)
    },
    onPointerCancel: () => { setIsDragging(false); setDragX(0) },
  }

  if (n === 0) {
    return <div className="mf-fadein" style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '48px 20px' }}>Nothing to review yet. Measure the job first.</div>
  }

  // ── End state summary ──
  if (done) {
    return (
      <div className="mf-fadein" style={{ maxWidth: 560, margin: '24px auto', textAlign: 'center' }}>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: '24px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text, #1b2426)' }}>
            Kept {kept.length} of {n}. Total {money(gradeTotal(kept, grade))} at {GRADES.find(g => g.key === grade)?.label}.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button style={{ ...heroBtn, opacity: saving ? 0.6 : 1 }} onClick={() => onSave(kept)} disabled={saving}>
            <PawPrint size={16} /> {saving ? 'Saving…' : 'Save order'}
          </button>
          <button style={btn} onClick={() => onEditDetails(kept)}>Edit details</button>
          <button style={btn} onClick={() => onExportCsv(kept)}>Export CSV</button>
        </div>
      </div>
    )
  }

  const topTransform = flingDir !== 0
    ? `translateX(${flingDir * 140}%) rotate(${flingDir * 18}deg)`
    : `translateX(${dragX}px) rotate(${dragX * 0.05}deg)`
  const topOpacity = flingDir !== 0 ? 0 : 1
  const keepOpacity = Math.min(1, Math.max(0, dragX) / 120) || (flingDir === 1 ? 1 : 0)
  const removeOpacity = Math.min(1, Math.max(0, -dragX) / 120) || (flingDir === -1 ? 1 : 0)

  return (
    <div className="mf-fadein" style={{ maxWidth: 480, margin: '16px auto' }}>
      {/* Deck header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {GRADES.map(g => (
          <button key={g.key} onClick={() => onGradeChange(g.key)} style={gradeChip(grade === g.key)}>{g.label}</button>
        ))}
        {storeName && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-muted)' }}>{storeName}</span>}
      </div>

      {/* Deck */}
      <div ref={containerRef} style={{ position: 'relative', height: 260 }}>
        {[2, 1, 0].map(offset => {
          const cardIdx = idx + offset
          if (cardIdx >= n) return null
          const line = lines[cardIdx]
          if (offset === 0) {
            return (
              <Card
                key={line.id}
                line={line}
                grade={grade}
                className={isDragging ? '' : 'mf-card-anim'}
                style={{ transform: topTransform, opacity: topOpacity, zIndex: 3, cursor: isDragging ? 'grabbing' : 'grab' }}
                dragHandlers={dragHandlers}
                overlay={
                  <>
                    <span style={{ position: 'absolute', top: 16, left: 16, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, fontWeight: 700, fontSize: 12, background: 'rgba(38,70,76,0.16)', color: '#26464C', opacity: keepOpacity }}>
                      <Check size={14} /> KEEP
                    </span>
                    <span style={{ position: 'absolute', top: 16, right: 16, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, fontWeight: 700, fontSize: 12, background: 'var(--color-surface-2, #eef0f0)', color: 'var(--color-text-muted)', opacity: removeOpacity }}>
                      <X size={14} /> REMOVE
                    </span>
                  </>
                }
              />
            )
          }
          return (
            <Card
              key={line.id}
              line={line}
              grade={grade}
              className="mf-card-anim"
              style={{ transform: `scale(${1 - offset * 0.05}) translateY(${offset * 10}px)`, opacity: 1, zIndex: 3 - offset }}
            />
          )
        })}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => commit('remove')}><X size={15} /> Remove</button>
        <button style={{ ...btn, opacity: decided.length === 0 ? 0.5 : 1 }} onClick={undo} disabled={decided.length === 0}><RotateCcw size={14} /> Undo</button>
        <button style={btn} onClick={() => commit('keep')}><Check size={15} /> Keep</button>
      </div>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--color-text-muted)' }}>
        {Math.min(idx + 1, n)} of {n}
        <span style={{ marginLeft: 12, opacity: 0.7 }}><ArrowLeft size={11} style={{ verticalAlign: 'middle' }} /> remove · keep <ArrowRight size={11} style={{ verticalAlign: 'middle' }} /></span>
      </div>
    </div>
  )
}
