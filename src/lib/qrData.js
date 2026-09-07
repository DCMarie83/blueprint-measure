import { buildPaymentMethods } from './paymentMethods'
import { supabase } from './supabase'
import { portalQrUrl } from './portalAsset'

async function toDataUrl(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  const blob = await res.blob()
  return await new Promise(resolve => {
    const fr = new FileReader()
    fr.onloadend = () => resolve(fr.result)
    fr.readAsDataURL(blob)
  })
}

// Pre-fetch QR images as data URLs for client-side PDF generation.
// Authenticated surfaces sign against the private bucket; portals stream
// through the portal-asset edge function.
export async function fetchQrDataUrls(paymentInstructions) {
  const out = {}
  for (const m of buildPaymentMethods(paymentInstructions)) {
    if (!m.qr_path) continue
    try {
      const { data } = await supabase.storage.from('payment-qr').createSignedUrl(m.qr_path, 300)
      if (!data?.signedUrl) continue
      const dataUrl = await toDataUrl(data.signedUrl)
      if (dataUrl) out[m.key] = dataUrl
    } catch { /* image simply not embedded */ }
  }
  return out
}

export async function fetchPortalQrDataUrls(paymentInstructions, token) {
  const out = {}
  for (const m of buildPaymentMethods(paymentInstructions)) {
    if (!m.qr_path) continue
    try {
      const dataUrl = await toDataUrl(portalQrUrl(token, m.key))
      if (dataUrl) out[m.key] = dataUrl
    } catch { /* image simply not embedded */ }
  }
  return out
}
