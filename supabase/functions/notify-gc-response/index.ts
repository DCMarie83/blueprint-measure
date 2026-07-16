// notify-gc-response — tells the sub that a GC responded to an invoice.
//
// Called (fire-and-forget) by the anon GC review page AFTER a successful
// gc_respond_to_invoice RPC. Input is only { token } — the invoice's
// portal_token — so this function is intentionally PUBLIC (no user auth); it
// leaks nothing, it just reads the invoice by its unguessable token and emails
// the sub. Standard CORS/OPTIONS. Never throws back at the GC: any failure is
// logged and the GC's confirmation state is unaffected.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// gc_approval's stored value set is not guaranteed; normalize defensively.
function isApproved(gcApproval: unknown): boolean {
  return String(gcApproval ?? '').toLowerCase().startsWith('approv')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { token } = await req.json()
    if (!token) return json({ error: 'token required' }, 400)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 1. Resolve the invoice by its portal_token.
    const { data: invoice, error: invErr } = await adminClient
      .from('invoices')
      .select('id, invoice_number, company_id, client_id, project_id, gc_approval, gc_comment')
      .eq('portal_token', token)
      .single()
    if (invErr || !invoice) return json({ error: 'Invoice not found' }, 404)

    // 2. Resolve the GC name — invoice.client_id first, then the project's client.
    let clientId = invoice.client_id as string | null
    if (!clientId && invoice.project_id) {
      const { data: project } = await adminClient
        .from('projects')
        .select('client_id')
        .eq('id', invoice.project_id)
        .single()
      clientId = project?.client_id ?? null
    }
    let gcName = 'A general contractor'
    if (clientId) {
      const { data: client } = await adminClient
        .from('clients')
        .select('display_name, business_name')
        .eq('id', clientId)
        .single()
      if (client) gcName = client.business_name || client.display_name || gcName
    }

    // 3. Resolve the sub's email — the company's admin user via user_profiles.
    const { data: profiles } = await adminClient
      .from('user_profiles')
      .select('user_id, role')
      .eq('company_id', invoice.company_id)
    if (!profiles || profiles.length === 0) return json({ error: 'No company user' }, 404)
    const chosen = profiles.find((p: { role: string }) => p.role === 'contractor_admin') ?? profiles[0]
    const { data: authUser, error: authErr } = await adminClient.auth.admin.getUserById(chosen.user_id)
    if (authErr || !authUser?.user?.email) return json({ error: 'No recipient email' }, 404)
    const subEmail = authUser.user.email

    // 4. Build the notification.
    const approved = isApproved(invoice.gc_approval)
    const comment = (invoice.gc_comment ?? '').toString().trim()
    const number = invoice.invoice_number
    const subject = approved
      ? `${gcName} approved invoice ${number}`
      : `${gcName} requested changes on invoice ${number}`

    const siteUrl = Deno.env.get('SITE_URL') || 'https://app.rivetdog.com'
    const invoiceUrl = `${siteUrl}/invoices/${invoice.id}`

    const commentHtml = comment
      ? `<div style="margin: 16px 0; padding: 16px; background: #f9fafb; border-left: 3px solid #F27243; border-radius: 6px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 6px;">Their note</div>
          <p style="font-size: 15px; color: #1b2426; line-height: 1.5; margin: 0; white-space: pre-wrap;">${escapeHtml(comment)}</p>
        </div>`
      : ''

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1b2426; margin: 0 0 16px 0;">${escapeHtml(subject)}</h2>
        <p style="font-size: 15px; color: #1b2426; line-height: 1.5;">
          ${approved
            ? `<strong>${escapeHtml(gcName)}</strong> approved invoice <strong>${escapeHtml(number)}</strong>.`
            : `<strong>${escapeHtml(gcName)}</strong> asked for changes on invoice <strong>${escapeHtml(number)}</strong>.`}
        </p>
        ${commentHtml}
        <div style="text-align: center; margin: 24px 0;">
          <a href="${invoiceUrl}" style="display: inline-block; padding: 14px 28px; background: #F27243; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">Open the invoice</a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 11px; color: #999; text-align: center;">Powered by RivetDog</p>
      </div>
    `

    const text = `${subject}\n\n${comment ? `Their note:\n${comment}\n\n` : ''}Open the invoice: ${invoiceUrl}`

    // 5. Send via Resend.
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RivetDog <noreply@rivetdog.com>',
        to: [subEmail],
        subject,
        html,
        text,
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('Resend failed', errText)
      return json({ error: 'Email send failed' }, 502)
    }

    return json({ success: true })

  } catch (err) {
    console.error('notify-gc-response error', err)
    return json({ error: 'Internal error' }, 500)
  }
})
