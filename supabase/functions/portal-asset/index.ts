// portal-asset: streams a payment QR image from the private payment-qr bucket
// to anonymous portal viewers. The portal token is validated exactly as the
// get_portal_* readers do — a project token must belong to a portal-enabled
// project; an invoice token must belong to a client-visible invoice. Deployed
// with --no-verify-jwt like the other anon portal functions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const METHODS_WITH_QR = ['zelle', 'venmo', 'cashapp']
const CONTENT_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') || ''
    const method = url.searchParams.get('method') || ''
    if (!token || !METHODS_WITH_QR.includes(method)) {
      return new Response('Not found', { status: 404, headers: CORS })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Resolve the company through either portal token family.
    let companyId: string | null = null
    const { data: project } = await adminClient
      .from('projects')
      .select('company_id')
      .eq('portal_token', token)
      .eq('portal_enabled', true)
      .maybeSingle()
    if (project) {
      companyId = project.company_id
    } else {
      const { data: invoice } = await adminClient
        .from('invoices')
        .select('company_id, status')
        .eq('portal_token', token)
        .in('status', ['sent', 'viewed', 'partial', 'paid', 'void'])
        .maybeSingle()
      if (invoice) companyId = invoice.company_id
    }
    if (!companyId) return new Response('Not found', { status: 404, headers: CORS })

    const { data: company } = await adminClient
      .from('companies')
      .select('payment_instructions')
      .eq('id', companyId)
      .single()
    const methodConfig = company?.payment_instructions?.[method]
    const qrPath: string | null = methodConfig?.enabled ? (methodConfig?.qr_path || null) : null
    // The stored path must stay inside this company's folder.
    if (!qrPath || !qrPath.startsWith(`${companyId}/`)) {
      return new Response('Not found', { status: 404, headers: CORS })
    }

    const { data: file, error: dlErr } = await adminClient.storage.from('payment-qr').download(qrPath)
    if (dlErr || !file) return new Response('Not found', { status: 404, headers: CORS })

    const ext = qrPath.split('.').pop()?.toLowerCase() || 'png'
    return new Response(file.stream(), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err) {
    console.error('portal-asset error', err)
    return new Response('Not found', { status: 404, headers: CORS })
  }
})
