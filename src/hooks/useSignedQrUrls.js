import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { buildPaymentMethods } from '../lib/paymentMethods'

// Signed URLs for the private payment-qr bucket, for authenticated surfaces
// (invoice detail, settings preview). Storage RLS scopes reads to the caller's
// company via the first path segment.
export function useSignedQrUrls(paymentInstructions) {
  const [urls, setUrls] = useState({})
  const paths = buildPaymentMethods(paymentInstructions)
    .filter(m => m.qr_path)
    .map(m => `${m.key}|${m.qr_path}`)
    .join(',')

  useEffect(() => {
    if (!paths) { setUrls({}); return }
    let cancelled = false
    ;(async () => {
      const next = {}
      for (const pair of paths.split(',')) {
        const idx = pair.indexOf('|')
        const key = pair.slice(0, idx)
        const path = pair.slice(idx + 1)
        try {
          const { data } = await supabase.storage.from('payment-qr').createSignedUrl(path, 3600)
          if (data?.signedUrl) next[key] = data.signedUrl
        } catch { /* image simply not shown */ }
      }
      if (!cancelled) setUrls(next)
    })()
    return () => { cancelled = true }
  }, [paths])

  return urls
}
