import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { GOOGLE_ADS_TAG_ID, GOOGLE_ADS_DEMO_LEAD_CONVERSION_LABEL } from '../../lib/config'
import { US_STATES } from '../../data/usStates'
import { readUtms, utmQuery, getStoredState, setStoredState } from './tryUtm'
import r from './reveal.module.css'

// The real /try email gate. Its ONLY network call is the anon submit_demo_lead
// RPC, fired-and-forgotten (never blocks the UI). The magnet email is sent by
// GHL downstream from the demo_leads row — this component never calls a send-*
// function. "Sign up now" skips the capture and goes straight to /signup.
export default function EmailGate({ flow, caption }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [stateCode, setStateCode] = useState(() => getStoredState())
  const [error, setError] = useState('')

  const emailValid = (v) => v.trim() !== '' && v.includes('@')

  function toEnd() {
    const params = new URLSearchParams({ flow })
    if (stateCode) params.set('state', stateCode)
    navigate(`/try/done?${params.toString()}`)
  }

  function handleSeeIt() {
    if (!emailValid(email)) { setError('Enter a valid email so we can send it over.'); return }
    setStoredState(stateCode)

    // Fire-and-forget the ONLY write in the demo (mirrors the portal accept
    // pattern). Never awaited, never surfaced to the UI.
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

    // Dedicated demo-lead conversion — dormant until the label is set, so it
    // never contaminates the founders/Lite conversions.
    if (typeof window.gtag === 'function' && GOOGLE_ADS_DEMO_LEAD_CONVERSION_LABEL) {
      window.gtag('event', 'conversion', {
        send_to: `${GOOGLE_ADS_TAG_ID}/${GOOGLE_ADS_DEMO_LEAD_CONVERSION_LABEL}`,
        currency: 'USD',
      })
    }

    toEnd()
  }

  return (
    <div className={r.gate}>
      {caption && <p className={r.gateCaption}>{caption}</p>}
      <h3 className={r.gateTitle}>Want this for your own jobs?</h3>
      <div className={r.gateFields}>
        <input
          className={r.gateInput}
          type="text"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={r.gateInput}
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
        />
        <select
          className={r.gateInput}
          value={stateCode}
          onChange={(e) => setStateCode(e.target.value)}
          aria-label="Your state"
        >
          <option value="">Your state (optional)</option>
          {US_STATES.map((st) => <option key={st.code} value={st.code}>{st.name}</option>)}
        </select>
      </div>
      {error && <p className={r.gateError}>{error}</p>}
      <button className={r.gateBtn} onClick={handleSeeIt}>See it in action</button>
      <button className={r.gateSignup} onClick={() => navigate(`/signup${utmQuery()}`)}>Sign up now</button>
      <div>
        <button className={r.gateSkip} onClick={toEnd}>Skip for now</button>
      </div>
    </div>
  )
}
