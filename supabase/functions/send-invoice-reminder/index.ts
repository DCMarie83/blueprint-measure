// send-invoice-reminder: balance-led reminders and paid-in-full receipts.
//
// Two entry modes:
//  (a) Webhook mode — the Dashboard database webhook posts every INSERT on
//      invoice_reminders with the row as payload. Auth: the Authorization
//      header must be exactly `Bearer <service role key>` (the webhook is
//      configured with that header); no user JWT exists on this path, so the
//      function deploys with --no-verify-jwt and does this check itself.
//  (b) App mode — an authenticated user sends {invoice_id, kind, pdf_base64?}.
//      The user JWT is validated and the caller must belong to the invoice's
//      company (or be a super admin). A 'manual' invoice_reminders row is
//      inserted, processed, and marked.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildPaymentMethods, EN_METHOD_LABELS, EN_LINE_LABELS } from '../_shared/paymentMethods.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtMoney(v: number): string {
  return `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  const iso = String(d)
  const date = iso.length === 10 ? new Date(iso + 'T00:00:00Z') : new Date(iso)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function renderPaymentInstructionsHTML(pi: Record<string, unknown> | null, primaryColor: string, portalUrl: string | null): string {
  const methods = buildPaymentMethods(pi, { surface: 'email' })
  if (methods.length === 0) return ''
  const blocks: string[] = []
  for (const m of methods) {
    if (m.pointer) {
      const text = escapeHtml(m.lines[0]?.value || '')
      blocks.push(`<p style="font-size: 14px; color: #1b2426; line-height: 1.6; margin: 0 0 10px;">${portalUrl ? `<a href="${portalUrl}" style="color:${primaryColor};">${text}</a>` : text}</p>`)
      continue
    }
    const parts: string[] = []
    if (m.key !== 'other') parts.push(`<strong>${EN_METHOD_LABELS[m.key] || m.key}</strong>`)
    for (const line of m.lines) {
      parts.push(line.label ? `${EN_LINE_LABELS[line.label] || line.label}: ${escapeHtml(line.value)}` : escapeHtml(line.value).replace(/\n/g, '<br/>'))
    }
    if (m.link) {
      if (m.key === 'card_external') parts.push(`<a href="${m.link}" style="display:inline-block; background:${primaryColor}; color:white; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:600;">${escapeHtml(m.linkLabel || 'Pay by card')}</a>`)
      else parts.push(`<a href="${m.link}" style="color:${primaryColor};">${escapeHtml(m.link)}</a>`)
    }
    blocks.push(`<p style="font-size: 14px; color: #1b2426; line-height: 1.6; margin: 0 0 10px;">${parts.join('<br/>')}</p>`)
  }
  return `
    <div style="margin: 20px 0; padding: 16px; background: #f9fafb; border-radius: 8px;">
      <h3 style="color: ${primaryColor}; font-size: 14px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px;">Payment Methods</h3>
      ${blocks.join('')}
    </div>
  `
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const body = await req.json()
    const isWebhook = !!body?.record && typeof body.record === 'object'

    let reminderRow: Record<string, unknown>
    let pdfBase64: string | null = null

    if (isWebhook) {
      // Webhook auth: exact service-role bearer, nothing else.
      const authHeader = req.headers.get('Authorization') || ''
      if (authHeader !== `Bearer ${serviceKey}`) return json({ error: 'Forbidden' }, 403)
      reminderRow = body.record
      if (reminderRow.status !== 'queued') return json({ ok: true, skipped: 'not queued' })
    } else {
      // App mode: validate the user JWT and company membership.
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return json({ error: 'Missing auth' }, 401)
      const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error: userErr } = await anonClient.auth.getUser()
      if (userErr || !user) return json({ error: 'Invalid auth' }, 401)

      const { invoice_id, kind } = body
      if (!invoice_id) return json({ error: 'invoice_id required' }, 400)
      if (!['reminder', 'receipt'].includes(kind)) return json({ error: 'kind must be reminder or receipt' }, 400)
      pdfBase64 = typeof body.pdf_base64 === 'string' && body.pdf_base64 ? body.pdf_base64 : null

      const { data: inv } = await adminClient.from('invoices')
        .select('id, company_id, total, status').eq('id', invoice_id).single()
      if (!inv) return json({ error: 'Invoice not found' }, 404)

      const { data: callerProfile } = await adminClient.from('user_profiles')
        .select('company_id').eq('user_id', user.id).single()
      const { data: superRow } = await adminClient.from('super_admins')
        .select('email').eq('email', user.email).maybeSingle()
      if (!superRow && callerProfile?.company_id !== inv.company_id) {
        return json({ error: 'Forbidden' }, 403)
      }

      // Early refusals before a row exists.
      if (inv.status === 'void') return json({ error: 'This invoice is void.' }, 400)
      if (kind === 'reminder' && inv.status === 'paid') return json({ error: 'This invoice is paid. Send a receipt instead.' }, 400)
      if (kind === 'receipt' && inv.status !== 'paid') return json({ error: 'A receipt can only be sent for a paid invoice.' }, 400)

      const { data: pmtsForBalance } = await adminClient.from('invoice_payments')
        .select('amount').eq('invoice_id', invoice_id)
      const ledger = (pmtsForBalance ?? []).reduce((s: number, p: { amount: number }) => s + (Number(p.amount) || 0), 0)
      const balance = Math.round(((Number(inv.total) || 0) - ledger) * 100) / 100

      const { data: newRow, error: insErr } = await adminClient.from('invoice_reminders')
        .insert({ company_id: inv.company_id, invoice_id, kind, step: 'manual', balance_due: Math.max(0, balance), status: 'queued' })
        .select().single()
      if (insErr) return json({ error: insErr.message }, 500)
      reminderRow = newRow
    }

    // ── Common processing ────────────────────────────────────────────
    const rid = reminderRow.id as string
    const kind = reminderRow.kind as string
    const step = reminderRow.step as string
    const invoiceId = reminderRow.invoice_id as string

    const mark = async (status: string, extra: Record<string, unknown> = {}) => {
      await adminClient.from('invoice_reminders').update({ status, ...extra }).eq('id', rid)
    }

    const { data: invoice } = await adminClient.from('invoices')
      .select('id, invoice_number, title, status, total, due_date, project_id, company_id, client_id, portal_token, reminders_verified_at, import_source')
      .eq('id', invoiceId).single()
    if (!invoice) { await mark('skipped', { error: 'invoice missing' }); return json({ ok: true, skipped: true }) }

    const { data: payments } = await adminClient.from('invoice_payments')
      .select('amount, payment_method, payment_date, reference_number')
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: true })
    const paidToDate = Math.round((payments ?? []).reduce((s: number, p: { amount: number }) => s + (Number(p.amount) || 0), 0) * 100) / 100
    const balanceDue = Math.round(((Number(invoice.total) || 0) - paidToDate) * 100) / 100

    // Guards (webhook mode marks skipped; app mode already refused hard cases)
    if (invoice.status === 'void') { await mark('skipped', { error: 'void' }); return json({ ok: true, skipped: true }) }
    if (kind === 'reminder') {
      if (!['sent', 'viewed', 'partial'].includes(invoice.status) || balanceDue <= 0) {
        await mark('skipped', { error: `status=${invoice.status}, balance=${balanceDue}` })
        return json({ ok: true, skipped: true })
      }
    } else if (invoice.status !== 'paid') {
      await mark('skipped', { error: `receipt on status=${invoice.status}` })
      return json({ ok: true, skipped: true })
    }

    // Company, client, recipients
    const { data: company } = await adminClient.from('companies')
      .select('name, primary_color, payment_instructions').eq('id', invoice.company_id).single()
    const { data: project } = await adminClient.from('projects')
      .select('id, name, client_id').eq('id', invoice.project_id).maybeSingle()
    const clientId = invoice.client_id || project?.client_id || null
    if (!clientId) { await mark('skipped', { error: 'no client' }); return json({ ok: true, skipped: true }) }
    const { data: client } = await adminClient.from('clients')
      .select('id, display_name, primary_email, client_contacts(email, is_portal_recipient)')
      .eq('id', clientId).single()
    const flagged = (client?.client_contacts ?? [])
      .filter((c: { is_portal_recipient: boolean; email: string | null }) => c.is_portal_recipient && c.email)
      .map((c: { email: string }) => c.email)
    const recipients = Array.from(new Set([...flagged, ...(client?.primary_email ? [client.primary_email] : [])]))
    if (recipients.length === 0) { await mark('skipped', { error: 'no recipients' }); return json({ ok: true, skipped: true }) }

    const companyName = company?.name || 'Your Contractor'
    const tenantPrimary = company?.primary_color || '#f27243'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://app.rivetdog.com'
    const portalUrl = invoice.portal_token ? `${siteUrl}/portal/invoice/${invoice.portal_token}` : null

    const isReceipt = kind === 'receipt'
    const subject = isReceipt
      ? `Receipt for invoice ${invoice.invoice_number}, paid in full`
      : `Balance due ${fmtMoney(balanceDue)} on invoice ${invoice.invoice_number}`

    const daysPastDue = invoice.due_date
      ? Math.floor((Date.now() - new Date(invoice.due_date + 'T00:00:00Z').getTime()) / 86400000)
      : null

    const paymentsRows = (payments ?? []).map((p: { payment_date: string; payment_method: string | null; reference_number: string | null; amount: number }) =>
      `<tr>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${fmtDate(p.payment_date)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; text-transform:capitalize;">${escapeHtml((p.payment_method || '').replace(/_/g, ' '))}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; color:#777;">${escapeHtml(p.reference_number || '')}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right; font-family:monospace;">${fmtMoney(Number(p.amount) || 0)}</td>
      </tr>`).join('')
    const paymentsBlock = (payments ?? []).length > 0 ? `
      <table style="width:100%; border-collapse:collapse; font-size:13px; margin:12px 0;">
        <thead><tr>
          <th style="text-align:left; padding:6px 8px; font-size:11px; color:#777; text-transform:uppercase;">Date</th>
          <th style="text-align:left; padding:6px 8px; font-size:11px; color:#777; text-transform:uppercase;">Method</th>
          <th style="text-align:left; padding:6px 8px; font-size:11px; color:#777; text-transform:uppercase;">Reference</th>
          <th style="text-align:right; padding:6px 8px; font-size:11px; color:#777; text-transform:uppercase;">Amount</th>
        </tr></thead>
        <tbody>${paymentsRows}</tbody>
        <tfoot>
          <tr><td colspan="3" style="padding:6px 8px; font-weight:600;">Paid to date</td><td style="padding:6px 8px; text-align:right; font-family:monospace;">${fmtMoney(paidToDate)}</td></tr>
          <tr><td colspan="3" style="padding:6px 8px; font-weight:700;">${balanceDue > 0 ? 'Balance due' : 'Balance'}</td><td style="padding:6px 8px; text-align:right; font-family:monospace; font-weight:700; color:${balanceDue > 0 ? '#dc2626' : '#16a34a'};">${fmtMoney(Math.max(0, balanceDue))}</td></tr>
        </tfoot>
      </table>` : ''

    const leadLine = isReceipt
      ? `<p style="font-size:16px; color:#1b2426; line-height:1.5;">Invoice <strong>${escapeHtml(invoice.invoice_number)}</strong> is <strong style="color:#16a34a;">paid in full</strong>. Thank you.</p>`
      : `<p style="font-size:16px; color:#1b2426; line-height:1.5;">A balance of <strong style="color:#dc2626;">${fmtMoney(balanceDue)}</strong> remains on invoice <strong>${escapeHtml(invoice.invoice_number)}</strong>.</p>`

    const dueLine = !isReceipt && invoice.due_date
      ? `<p style="font-size:14px; color:#555;">Due ${fmtDate(invoice.due_date)}${daysPastDue != null && daysPastDue > 0 ? ` (${daysPastDue} day${daysPastDue === 1 ? '' : 's'} past due)` : ''}.</p>`
      : ''

    const portalBtn = portalUrl
      ? `<a href="${portalUrl}" style="display:inline-block; margin:16px 0; padding:12px 24px; background:${tenantPrimary}; color:white; text-decoration:none; border-radius:8px; font-weight:600;">View Invoice Online</a>`
      : ''

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width:560px; margin:0 auto; padding:24px;">
        <h2 style="color:${tenantPrimary}; margin:0 0 16px 0;">${escapeHtml(companyName)}</h2>
        ${leadLine}
        ${dueLine}
        ${paymentsBlock}
        ${isReceipt ? '' : renderPaymentInstructionsHTML(company?.payment_instructions ?? null, tenantPrimary, portalUrl)}
        ${portalBtn}
        <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">
        <p style="font-size:11px; color:#999; text-align:center;">Powered by RivetDog</p>
      </div>
    `

    const attachments = pdfBase64
      ? [{ filename: `${isReceipt ? 'receipt-' : ''}${String(invoice.invoice_number).replace(/[^a-zA-Z0-9_\- ]/g, '')}.pdf`, content: pdfBase64 }]
      : []

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${companyName} via RivetDog <noreply@rivetdog.com>`,
        to: recipients,
        subject,
        html,
        ...(attachments.length ? { attachments } : {}),
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      await mark('failed', { error: errText.slice(0, 500) })
      return json({ error: 'Email send failed' }, 502)
    }

    await mark('sent', { sent_at: new Date().toISOString() })

    const invoicePatch: Record<string, unknown> = {}
    if (!isReceipt) invoicePatch.last_reminded_at = new Date().toISOString()
    if (!isWebhook && !invoice.reminders_verified_at) invoicePatch.reminders_verified_at = new Date().toISOString()
    if (Object.keys(invoicePatch).length > 0) {
      await adminClient.from('invoices').update(invoicePatch).eq('id', invoiceId)
    }

    try {
      await adminClient.from('client_activity').insert({
        client_id: clientId,
        company_id: invoice.company_id,
        activity_type: isReceipt ? 'receipt_sent' : 'invoice_reminder_sent',
        title: isReceipt
          ? `Receipt sent for invoice ${invoice.invoice_number}`
          : `Payment reminder sent for invoice ${invoice.invoice_number} (${fmtMoney(balanceDue)} due)`,
        is_automated: true,
        metadata: { invoice_id: invoiceId, invoice_number: invoice.invoice_number, balance_due: balanceDue, step },
      })
    } catch { /* activity is best-effort */ }

    return json({ ok: true, recipientCount: recipients.length })
  } catch (err) {
    console.error('[send-invoice-reminder]', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
