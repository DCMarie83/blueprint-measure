import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { FOUNDER_SPOTS_SCARCITY_THRESHOLD } from '../../lib/config'
import { US_STATES } from '../../data/usStates'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import { utmQuery, resolveState } from './tryUtm'
import r from './reveal.module.css'

// Flow → the reveal to return to, and its common.* CTA key.
const REPLAY = {
  estimate: { to: '/try/gc/estimate/reveal', key: 'seeClient' },
  jobs: { to: '/try/gc/estimate/reveal', key: 'seeClient' },
  crew: { to: '/try/gc/crew/reveal', key: 'seePay' },
  sub: { to: '/try/sub/reveal', key: 'seeGc' },
}

export default function TryEndScreen() {
  const [searchParams] = useSearchParams()
  const { lang } = useTryLang()
  const e = tr('end', lang)
  const c = tr('common', lang)

  const flow = searchParams.get('flow') || 'estimate'
  const stateCode = resolveState(searchParams)
  const stateName = stateCode ? (US_STATES.find((s) => s.code === stateCode)?.name || stateCode) : ''
  // Fallback word for the {state} placeholder when no state is resolvable.
  const stateSlot = stateName || (lang === 'es' ? 'tu estado' : 'your state')

  const [scarcity, setScarcity] = useState(null)
  const [scarcityLoading, setScarcityLoading] = useState(false)

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
    if (!stateCode) return <p className={r.endScarcity}>Only 25 founder spots per state.</p>
    if (scarcityLoading) return <p className={r.endScarcitySub}>Checking availability…</p>
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
        <div className={r.endEyebrow}>{e.eyebrow}</div>
        <h1 className={r.endHeadline}>{e.headline.replace('{state}', stateSlot)}</h1>
        <p className={r.endTrial}>{e.trial}</p>

        <div className={r.endScarcityBox}>{renderScarcity()}</div>

        <div className={r.endCtas}>
          <Link to={`/signup${utmQuery()}`} className={r.endPrimary}>{e.primary}</Link>
          <Link to={replay.to} className={r.endSecondary}>{c[replay.key]}</Link>
        </div>

        <Link to="/try" className={r.endBack}>← {c.back}</Link>
      </div>
    </div>
  )
}
