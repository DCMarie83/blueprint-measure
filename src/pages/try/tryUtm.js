// Shared UTM/state helpers for the /try demo. Reads the same 'rivetdog_utms'
// JSON blob the rest of the app writes (SignupPage/LiteSignupPage), and a small
// 'rivetdog_try_state' bridge so the state chosen at the gate reaches the end
// screen. No network, no writes to anything but localStorage.

const UTM_STORAGE_KEY = 'rivetdog_utms'
const STATE_STORAGE_KEY = 'rivetdog_try_state'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

// Returns all five UTM params, null where absent (the submit_demo_lead shape).
export function readUtms() {
  const out = {}
  for (const k of UTM_KEYS) out[k] = null
  try {
    const raw = localStorage.getItem(UTM_STORAGE_KEY)
    if (raw) {
      const o = JSON.parse(raw) || {}
      for (const k of UTM_KEYS) if (o[k]) out[k] = o[k]
    }
  } catch { /* storage unavailable — leave nulls */ }
  return out
}

// A query string ("?utm_source=…") for carrying UTMs onto /signup, or '' if none.
export function utmQuery() {
  const u = readUtms()
  const params = new URLSearchParams()
  for (const k of UTM_KEYS) if (u[k]) params.set(k, u[k])
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function getStoredState() {
  try { return localStorage.getItem(STATE_STORAGE_KEY) || '' } catch { return '' }
}

export function setStoredState(code) {
  try { if (code) localStorage.setItem(STATE_STORAGE_KEY, code) } catch { /* no-op */ }
}

// Resolve a state: explicit ?state= on the URL wins, else the stored gate choice.
export function resolveState(searchParams) {
  const fromUrl = searchParams?.get?.('state')
  if (fromUrl) return fromUrl.toUpperCase()
  return getStoredState()
}
