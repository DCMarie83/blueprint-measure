import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { FOUNDER_SPOTS_SCARCITY_THRESHOLD } from '../../lib/config'
import { US_STATES } from '../../data/usStates'
import { utmQuery, resolveState } from './tryUtm'
import r from './reveal.module.css'

// Flow → the reveal to return to, and its secondary-CTA label.
const REPLAY = {
  estimate: { to: '/try/gc/estimate/reveal', label: 'See what your customer sees again' },
  jobs: { to: '/try/gc/estimate/reveal', label: 'See what your customer sees again' },
  crew: { to: '/try/gc/crew/reveal', label: 'See the pay statement again' },
  sub: { to: '/try/sub/reveal', label: 'See what your GC sees again' },
}

export default function TryEndScreen() {
  const [searchParams] = useSearchParams()
  const flow = searchParams.get('flow') || 'estimate'
  const stateCode = resolveState(searchParams)
  const stateName = stateCode ? (US_STATES.find((s) => s.code === stateCode)?.name || stateCode) : ''

  const [scarcity, setScarcity] = useState(null)
  const [scarcityLoading, setScarcityLoading] = useState(false)

  // Live scarcity — same read-only RPC + shape as SignupPage. Only when a state
  // is resolvable; otherwise we show the generic cap statement below.
  useEffect(() => {
    if (!stateCode) { setScarcity(null); return }
    let cancelled = false
    setScarcityLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase.rpc('get_founder_spots', { p_state: stateCode })
        if (!cancelled) setScarcity(data && data.length > 0 ? data[0] : null)
      } catch {
        if (!cancelled) setScarcity(null)
      } finally {
        if (!cancelled) setScarcityLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [stateCode])

  const replay = REPLAY[flow] || REPLAY.estimate

  function renderScarcity() {
    // No state: skip the live count, show the generic cap statement.
    if (!stateCode) {
      return <p className={r.endScarcity}>Only 25 founder spots per state.</p>
    }
    if (scarcityLoading) return <p className={r.endScarcitySub}>Checking availability…</p>
    // RPC failed or returned nothing → render nothing (silence beats a false promise).
    if (!scarcity) return null

    const cap = (
      <>
        <p className={r.endScarcity}>Only {scarcity.spots_total} founder spots per state.</p>
        <p className={r.endScarcitySub}>When {stateName} fills, the price goes up.</p>
      </>
    )
    if (scarcity.spots_remaining > FOUNDER_SPOTS_SCARCITY_THRESHOLD) return cap
    if (scarcity.spots_remaining > 0) {
      return (
        <p className={r.endScarcity}>
          Only {scarcity.spots_remaining} founder {scarcity.spots_remaining === 1 ? 'spot' : 'spots'} left in {stateName}.
        </p>
      )
    }
    if (scarcity.next_tier_name == null || scarcity.next_tier_price == null) return cap
    return (
      <p className={r.endScarcity}>
        {stateName} founder spots are gone — join at {scarcity.next_tier_name} for ${scarcity.next_tier_price}/mo.
      </p>
    )
  }

  return (
    <div className={r.revealWrap}>
      <div className={`${r.reveal} ${r.endCard}`}>
        <div className={r.endEyebrow}>Founders offer</div>
        <h1 className={r.endHeadline}>
          First 25 trade pros in {stateName || 'your state'} lock $79.99/mo — for life.
        </h1>
        <p className={r.endTrial}>14-day free trial · cancel anytime · locked for life.</p>

        <div className={r.endScarcityBox}>{renderScarcity()}</div>

        <div className={r.endCtas}>
          <Link to={`/signup${utmQuery()}`} className={r.endPrimary}>Start free trial</Link>
          <Link to={replay.to} className={r.endSecondary}>{replay.label}</Link>
        </div>

        <Link to="/try" className={r.endBack}>← Back to demo home</Link>
      </div>
    </div>
  )
}
