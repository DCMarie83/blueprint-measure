import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  GOOGLE_ADS_TAG_ID,
  GOOGLE_ADS_SIGNUP_CONVERSION_LABEL,
  GOOGLE_ADS_TIMEPAY_CONVERSION_LABEL,
  GOOGLE_ADS_TIMEPAY_CONVERSION_VALUE,
} from '../lib/config'

const UTM_STORAGE_KEY = 'rivetdog_utms'

// Keyed to the company that already converted this session (not a bare
// boolean). A bare boolean survived sign-out, so a SECOND signup in the same
// browser tab had its conversion suppressed — the exact smoke-test path.
// Keying to company.id still closes the /dashboard -> /jobs double-fire, since
// company.id is stable across routes for one company.
let firedForCompanyId = null

// In-flight guard for the UTM write only. The stash's presence in localStorage
// is the cross-render dedup (we clear it after a successful write); this just
// prevents two rapid effect runs from launching redundant concurrent writes.
let utmPersisting = false

export function useConversionTracker() {
  const { user, company } = useAuth()

  useEffect(() => {
    if (!user || !company) return

    // ── (a) UTM PERSISTENCE — fully independent of gtag, label, or conversion
    // state. Evaluated FIRST, BEFORE the conversion_fired_at guard: a company
    // that already converted (or whose conversion can't fire because gtag is
    // blocked) must still get its UTMs written. When gtag is blocked, the
    // company row is the ONLY attribution record we'll ever have.
    if (!utmPersisting) {
      let utms = null
      try {
        const raw = localStorage.getItem(UTM_STORAGE_KEY)
        if (raw) utms = JSON.parse(raw)
      } catch { /* corrupt localStorage — ignore */ }

      // Build an update from ONLY the keys that hold real values, so we never
      // write null/empty over columns that already hold a real attribution.
      const utmUpdate = {}
      if (utms) {
        if (utms.utm_source) utmUpdate.utm_source = utms.utm_source
        if (utms.utm_medium) utmUpdate.utm_medium = utms.utm_medium
        if (utms.utm_campaign) utmUpdate.utm_campaign = utms.utm_campaign
        if (utms.utm_content) utmUpdate.utm_content = utms.utm_content
        if (utms.utm_term) utmUpdate.utm_term = utms.utm_term
      }

      if (Object.keys(utmUpdate).length > 0) {
        utmPersisting = true
        ;(async () => {
          try {
            const { error } = await supabase
              .from('companies')
              .update(utmUpdate)
              .eq('id', company.id)
            if (error) {
              console.error('[conversion] UTM write failed:', error.message)
              return // keep the stash so a later mount retries
            }
            // Persisted — clear the stash. Its absence is the dedup guard.
            localStorage.removeItem(UTM_STORAGE_KEY)
          } catch (err) {
            console.error('[conversion] UTM write error:', err)
          } finally {
            utmPersisting = false
          }
        })()
      }
    }

    // ── (b) CONVERSION FIRE + STAMP — a separate concern that neither blocks
    // nor is blocked by (a). Requires a real label AND a live gtag; fires
    // first, then stamps. conversion_fired_at is never written without a fire.
    if (company.conversion_fired_at) return
    if (firedForCompanyId === company.id) return

    // Family-aware: every timepay_lite* plan key (founders, next tier, future
    // state promos) fires the Lite label/value. Everything else is founders.
    const isLite = company.plan_key?.startsWith('timepay_lite')
    const label = isLite ? GOOGLE_ADS_TIMEPAY_CONVERSION_LABEL : GOOGLE_ADS_SIGNUP_CONVERSION_LABEL
    const value = isLite ? GOOGLE_ADS_TIMEPAY_CONVERSION_VALUE : 79.99

    // No usable label -> fire NOTHING and stamp NOTHING, so the signup still
    // converts once the real label lands.
    if (!label || label === 'REPLACE_WITH_LABEL') {
      if (isLite) console.warn('[conversion] timepay_lite label not set — nothing fired, nothing stamped.')
      return
    }

    // gtag blocked or not yet loaded -> no fire is possible; do NOT stamp.
    // A later mount retries once gtag exists. (UTM persistence above already
    // ran regardless, so attribution is not lost.)
    if (typeof window.gtag !== 'function') return

    firedForCompanyId = company.id

    ;(async () => {
      try {
        // Fire, THEN stamp — never stamp without an actual fire.
        window.gtag('event', 'conversion', {
          send_to: `${GOOGLE_ADS_TAG_ID}/${label}`,
          value,
          currency: 'USD',
        })

        const { error } = await supabase
          .from('companies')
          .update({ conversion_fired_at: new Date().toISOString() })
          .eq('id', company.id)

        if (error) {
          console.error('[conversion] stamp write failed:', error.message)
          firedForCompanyId = null // allow retry on next render
        }
      } catch (err) {
        console.error('[conversion] Unexpected error:', err)
        firedForCompanyId = null
      }
    })()
  }, [user, company])
}
