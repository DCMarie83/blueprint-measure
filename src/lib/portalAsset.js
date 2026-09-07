import { supabaseUrl } from './supabase'

// QR images live in the private payment-qr bucket; the anon portal loads them
// through the portal-asset edge function, which validates the portal token
// server-side and streams the file with the service role.
export function portalQrUrl(token, method) {
  return `${supabaseUrl}/functions/v1/portal-asset?token=${encodeURIComponent(token)}&method=${encodeURIComponent(method)}`
}
