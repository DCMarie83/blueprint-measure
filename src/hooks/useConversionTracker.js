import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { GOOGLE_ADS_TAG_ID, GOOGLE_ADS_SIGNUP_CONVERSION_LABEL } from '../lib/config'

const UTM_STORAGE_KEY = 'rivetdog_utms'

export function useConversionTracker() {
  const { user, company } = useAuth()
  const firedRef = useRef(false)

  useEffect(() => {
    if (!user || !company) return
    if (company.conversion_fired_at) return
    if (firedRef.current) return
    firedRef.current = true

    ;(async () => {
      try {
        // Read UTMs from localStorage
        let utms = {}
        try {
          const raw = localStorage.getItem(UTM_STORAGE_KEY)
          if (raw) utms = JSON.parse(raw)
        } catch { /* corrupt localStorage — ignore */ }

        // Build update: conversion stamp + any UTM fields present
        const update = { conversion_fired_at: new Date().toISOString() }
        if (utms.utm_source) update.utm_source = utms.utm_source
        if (utms.utm_medium) update.utm_medium = utms.utm_medium
        if (utms.utm_campaign) update.utm_campaign = utms.utm_campaign
        if (utms.utm_content) update.utm_content = utms.utm_content
        if (utms.utm_term) update.utm_term = utms.utm_term

        // Write to company row
        const { error } = await supabase
          .from('companies')
          .update(update)
          .eq('id', company.id)

        if (error) {
          console.error('[conversion] DB write failed:', error.message)
          firedRef.current = false // allow retry on next render
          return
        }

        // Clear UTM stash after successful persist
        localStorage.removeItem(UTM_STORAGE_KEY)

        // Fire Google Ads conversion (skip if label is placeholder)
        if (GOOGLE_ADS_SIGNUP_CONVERSION_LABEL === 'REPLACE_WITH_LABEL') {
          console.warn('[conversion] Google Ads conversion label not set — DB stamped but gtag skipped.')
          return
        }

        if (typeof window.gtag === 'function') {
          window.gtag('event', 'conversion', {
            send_to: `${GOOGLE_ADS_TAG_ID}/${GOOGLE_ADS_SIGNUP_CONVERSION_LABEL}`,
            value: 79.99,
            currency: 'USD',
          })
        }
      } catch (err) {
        console.error('[conversion] Unexpected error:', err)
        firedRef.current = false
      }
    })()
  }, [user, company])
}
