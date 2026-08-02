import { useState, useRef, useEffect } from 'react'

// requestAnimationFrame count-up. Animates the displayed number from its
// previous settled value to `target` over `duration` ms with an ease-out so the
// figure "lands" rather than crawling. Uses the rAF-provided timestamp only
// (no Date.now), and is intentionally NOT gated on prefers-reduced-motion — the
// /try demo forces motion for every visitor by design.
export function useCountUp(target, duration = 260) {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const to = target
    if (from === to) return

    let start = 0
    const tick = (ts) => {
      if (!start) start = ts
      const t = Math.min(1, (ts - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplay(to)
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}
