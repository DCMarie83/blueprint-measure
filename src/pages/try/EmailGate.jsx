import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import r from './reveal.module.css'

// STUB gate for Stage 3.5 — renders the UI only. Real lead capture (the
// demo_leads anon RPC) is wired in Stage 4. Every path just advances to the
// end screen carrying the flow it came from.
export default function EmailGate({ flow, caption }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const done = () => navigate(`/try/done?flow=${flow}`)

  return (
    <div className={r.gate}>
      {caption && <p className={r.gateCaption}>{caption}</p>}
      <h3 className={r.gateTitle}>Want this for your own jobs?</h3>
      <div className={r.gateFields}>
        <input
          className={r.gateInput}
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={r.gateInput}
          type="email"
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button className={r.gateBtn} onClick={done}>See it in action</button>
      <button className={r.gateSignup} onClick={done}>Sign up now</button>
      <div>
        <button className={r.gateSkip} onClick={done}>Skip for now</button>
      </div>
    </div>
  )
}
