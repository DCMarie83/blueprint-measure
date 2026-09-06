import { useState, useEffect, useRef } from 'react'
import styles from './FloatingScrollbar.module.css'

// Platform-wide floating horizontal scrollbar (standing UI rule): every
// horizontally scrollable data table or board mounts one. A slim pill fixed
// to the VIEWPORT bottom (honoring --fab-bottom-offset and safe-area, with
// 76px right clearance for the feedback fab), two-way synced with the
// target's scrollLeft via equality-guarded listeners. Renders nothing when
// the target fits, and — via an IntersectionObserver plus a module-level
// registry — only the visible instance nearest the viewport center shows its
// bar when several scrollable targets are on screen at once.

const registry = new Set()
let electionFrame = null

function requestElection() {
  if (electionFrame != null) return
  electionFrame = requestAnimationFrame(() => {
    electionFrame = null
    let best = null
    let bestDist = Infinity
    const viewportCenter = window.innerHeight / 2
    for (const inst of registry) {
      if (!inst.eligible()) continue
      const rect = inst.rect()
      if (!rect) continue
      const dist = Math.abs((rect.top + rect.bottom) / 2 - viewportCenter)
      if (dist < bestDist) { bestDist = dist; best = inst }
    }
    for (const inst of registry) inst.setActive(inst === best)
  })
}

export default function FloatingScrollbar({ targetRef }) {
  const barRef = useRef(null)
  const [dims, setDims] = useState(null) // { left, width, scrollWidth }
  const [active, setActive] = useState(false)
  const stateRef = useRef({ overflows: false, intersecting: false })

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      const overflows = el.scrollWidth > el.clientWidth + 4
      stateRef.current.overflows = overflows
      setDims(overflows
        ? { left: rect.left, width: Math.max(rect.width - 76, 120), scrollWidth: el.scrollWidth }
        : null)
      requestElection()
    }
    measure()

    const instance = {
      eligible: () => stateRef.current.overflows && stateRef.current.intersecting,
      rect: () => targetRef.current?.getBoundingClientRect() ?? null,
      setActive: (next) => setActive(prev => (prev === next ? prev : next)),
    }
    registry.add(instance)

    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of el.children) ro.observe(child) // content growth
    window.addEventListener('resize', measure)

    // Meaningfully in view: a slice of the target must actually be on screen.
    const io = new IntersectionObserver((entries) => {
      stateRef.current.intersecting = entries[0]?.isIntersecting ?? false
      requestElection()
    }, { threshold: 0.15 })
    io.observe(el)

    // Vertical page scroll changes which visible target is nearest center.
    const onPageScroll = () => requestElection()
    window.addEventListener('scroll', onPageScroll, { passive: true })

    const onTargetScroll = () => {
      const bar = barRef.current
      if (bar && bar.scrollLeft !== el.scrollLeft) bar.scrollLeft = el.scrollLeft
    }
    el.addEventListener('scroll', onTargetScroll, { passive: true })

    return () => {
      registry.delete(instance)
      requestElection()
      ro.disconnect()
      io.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', onPageScroll)
      el.removeEventListener('scroll', onTargetScroll)
    }
  }, [targetRef])

  if (!dims || !active) return null

  return (
    <div
      ref={barRef}
      className={styles.floatScrollbar}
      style={{ left: dims.left, width: dims.width }}
      aria-hidden="true"
      onScroll={() => {
        const el = targetRef.current
        const bar = barRef.current
        if (el && bar && el.scrollLeft !== bar.scrollLeft) el.scrollLeft = bar.scrollLeft
      }}
    >
      <div style={{ width: dims.scrollWidth, height: 1 }} />
    </div>
  )
}

// Drop-in wrapper for table containers: same div (className/style preserved),
// with the floating scrollbar mounted as a fragment sibling so fixed
// positioning is never trapped by a transformed ancestor.
export function HScroll({ children, ...divProps }) {
  const ref = useRef(null)
  return (
    <>
      <div ref={ref} {...divProps}>{children}</div>
      <FloatingScrollbar targetRef={ref} />
    </>
  )
}

// Zero-wrapping variant: drop <ScrollbarInside /> anywhere inside an existing
// horizontally scrollable container and it targets its PARENT element. The
// probe is display:none and the bar itself is position:fixed, so the host's
// layout and scroll content are untouched. (Avoid inside transformed
// ancestors — position:fixed would be trapped; none of the app's table
// wrappers transform.)
export function ScrollbarInside() {
  const probeRef = useRef(null)
  const hostRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    hostRef.current = probeRef.current?.parentElement ?? null
    setReady(!!hostRef.current)
  }, [])

  return (
    <>
      <span ref={probeRef} style={{ display: 'none' }} aria-hidden="true" />
      {ready && <FloatingScrollbar targetRef={hostRef} />}
    </>
  )
}
