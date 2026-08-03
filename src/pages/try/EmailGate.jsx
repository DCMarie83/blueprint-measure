import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { GOOGLE_ADS_TAG_ID, GOOGLE_ADS_DEMO_LEAD_CONVERSION_LABEL } from '../../lib/config'
import { US_STATES } from '../../data/usStates'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import { readUtms, utmQuery, getStoredState, setStoredState } from './tryUtm'
import r from './reveal.module.css'

// Flow → the primary CTA label (reused from common.see*).
const SEE_KEY = { sub: 'seeGc', estimate: 'seeClient', jobs: 'seeClient', crew: 'seePay' }

// The real /try email gate. Its ONLY network call is the anon submit_demo_lead
// RPC, fired-and-forgotten (never blocks the UI). Copy/labels localized; the
// RPC call, args, and conversion wiring are unchanged.
export default function EmailGate({ flow, caption }) {
  const navigate = useNavigate()
  const { lang } = useTryLang()
  const c = tr('common', lang)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [stateCode, setStateCode] = useState(() => getStoredState())
  const [error, setError] = useState(false)

  const emailValid = (v) => v.trim() !== '' && v.includes('@')

  function toEnd() {
    const params = new URLSearchParams({ flow })
    if (stateCode) params.set('state', stateCode)
    navigate(`/try/done?${params.toString()}`)
  }

  function handleSeeIt() {
    if (!emailValid(email)) { setError(true); return }
    setStoredState(stateCode)

    const utm = readUtms()
    supabase.rpc('submit_demo_lead', {
      p_name: name.trim() || null,
      p_email: email.trim(),
      p_state: stateCode || null,
      p_demo_path: flow,
      p_utm_source: utm.utm_source,
      p_utm_medium: utm.utm_medium,
      p_utm_campaign: utm.utm_campaign,
      p_utm_content: utm.utm_content,
      p_utm_term: utm.utm_term,
    }).then(() => {}, () => {})

    if (typeof window.gtag === 'function' && GOOGLE_ADS_DEMO_LEAD_CONVERSION_LABEL) {
      window.gtag('event', 'conversion', {
        send_to: `${GOOGLE_ADS_TAG_ID}/${GOOGLE_ADS_DEMO_LEAD_CONVERSION_LABEL}`,
        currency: 'USD',
      })
    }

    toEnd()
  }

  const primaryLabel = c[SEE_KEY[flow] || 'seeClient']

  return (
    <div className={r.gate}>
      {caption && <p className={r.gateCaption}>{caption}</p>}
      <div className={r.gateFields}>
        <input
          className={r.gateInput}
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(false) }}
          aria-invalid={error}
        />
        <div className={r.gateRow}>
          <input
            className={r.gateInput}
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className={r.gateInput}
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            aria-label="State"
          >
            <option value="">State</option>
            {US_STATES.map((st) => <option key={st.code} value={st.code}>{st.code}</option>)}
          </select>
        </div>
      </div>
      <button className={r.gateBtn} onClick={handleSeeIt}>{primaryLabel}</button>
      <div className={r.gateAlt}>
        <button className={r.gateSignup} onClick={() => navigate(`${flow === 'sub' ? '/signup/lite' : '/signup'}${utmQuery()}`)}>{c.signup}</button>
        <button className={r.gateSkip} onClick={toEnd}>{c.skip}</button>
      </div>
    </div>
  )
}
