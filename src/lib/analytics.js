// ════════════════════════════════════════════════════════════════════
// analytics.js — product analytics foundation.
//
// Two independent sinks, both fire-and-forget and both non-throwing:
//   1. PostHog (client) via capture() — no-ops until initAnalytics() runs with
//      a non-empty POSTHOG_KEY.
//   2. product_events (our own DB table) via logProductEvent() — a durable,
//      super-admin-readable event log scoped by company_id.
//
// trackMaterials() fans a single call out to BOTH sinks.
//
// HARD RULES honored here:
//   • initAnalytics() is called ONCE from App.jsx top level, never from
//     AuthContext or any auth listener (onAuthStateChange stays synchronous).
//   • No secrets: POSTHOG_KEY is a public browser-safe ingest key.
//   • Failures are caught and console.warn'd only — never thrown, never routed
//     through logError (product analytics must never surface as a System Error).
// ════════════════════════════════════════════════════════════════════

import posthog from 'posthog-js'
import { supabase } from './supabase'
import { POSTHOG_KEY, POSTHOG_HOST } from './config'

let initialized = false

// Initialize PostHog exactly once, and only when a key is configured. Safe to
// call unconditionally from App startup; a no-op when POSTHOG_KEY is empty.
export function initAnalytics() {
  if (initialized) return
  if (!POSTHOG_KEY) return
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
      persistence: 'localStorage',
    })
    initialized = true
  } catch (err) {
    console.warn('[analytics] PostHog init failed:', err?.message || err)
  }
}

// Send an event to PostHog. Silently no-ops when PostHog is not initialized
// (empty key, init failure, or called before initAnalytics). Never throws.
export function capture(eventName, props = {}) {
  if (!initialized) return
  try {
    posthog.capture(eventName, props)
  } catch (err) {
    console.warn('[analytics] capture failed:', err?.message || err)
  }
}

// Insert one row into product_events. Fire-and-forget: the returned promise is
// intentionally not awaited by callers. Any failure is swallowed with a
// console.warn — never thrown, never logError'd.
//
// company_id must be the EFFECTIVE company (the acted-on tenant while
// impersonating); callers pass it in. user_id is read from the current session
// (the acting user — the super admin's id under impersonation, which is correct).
export async function logProductEvent({
  eventName,
  companyId,
  surface = 'materials',
  entityType = null,
  entityId = null,
  storeId = null,
  metadata = {},
} = {}) {
  try {
    if (!eventName || !companyId) return
    let userId = null
    try {
      const { data } = await supabase.auth.getUser()
      userId = data?.user?.id ?? null
    } catch {
      userId = null
    }
    const { error } = await supabase.from('product_events').insert({
      company_id: companyId,
      user_id: userId,
      event_name: eventName,
      surface,
      entity_type: entityType,
      entity_id: entityId,
      store_id: storeId,
      metadata: metadata || {},
    })
    if (error) console.warn('[analytics] product_events insert failed:', error.message)
  } catch (err) {
    console.warn('[analytics] logProductEvent error:', err?.message || err)
  }
}

// Single wrapper that records a materials-surface event to BOTH sinks.
// payload: { companyId, storeId, entityType, entityId, ...metadata }
// - PostHog receives the flattened metadata plus the ids.
// - product_events receives the structured columns; everything else lands in
//   the metadata jsonb.
export function trackMaterials(eventName, payload = {}) {
  const {
    companyId = null,
    storeId = null,
    entityType = 'material_order',
    entityId = null,
    surface = 'materials',
    ...metadata
  } = payload

  capture(eventName, { surface, store_id: storeId, entity_id: entityId, ...metadata })

  // Fire-and-forget — do not await.
  logProductEvent({
    eventName,
    companyId,
    surface,
    entityType,
    entityId,
    storeId,
    metadata,
  })
}
