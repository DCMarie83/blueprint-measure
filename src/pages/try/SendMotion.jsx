import { useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import r from './reveal.module.css'

// The "send" beat that precedes every reveal: a document flies toward the
// recipient, then a transition line. Calls onDone once so the reveal swaps in.
// Motion always plays (no reduced-motion gating).
export default function SendMotion({ line, onDone, duration = 950 }) {
  useEffect(() => {
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [onDone, duration])

  return (
    <div className={r.sendStage}>
      <div className={r.sendTrack}>
        <div className={r.sendDoc} />
        <ArrowRight className={r.sendArrow} size={22} />
      </div>
      <div className={r.sendLine}>{line}</div>
    </div>
  )
}
