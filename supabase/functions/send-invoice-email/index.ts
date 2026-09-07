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

import { buildPaymentMethods, EN_METHOD_LABELS, EN_LINE_LABELS } from '../_shared/paymentMethods.ts'

// Renders from the one shared payment model (_shared/paymentMethods.ts). QR
// images reference cid: inline attachments built by buildQrAttachments — the
// service role downloads them from the private payment-qr bucket; no signed
// URLs that would expire in the client's inbox.
function renderPaymentInstructionsHTML(pi: Record<string, unknown> | null, primaryColor: string, heading = 'Payment Methods', portalUrl: string | null = null): string {
  const methods = buildPaymentMethods(pi, { surface: 'email' })
  if (methods.length === 0) return ''
  const blocks: string[] = []
  for (const m of methods) {
    const parts: string[] = []
    if (m.pointer) {
      // Bank details never ride an email: one pointer line, linked to the
      // secure portal page when we have it.
      const text = escapeHtml(m.lines[0]?.value || '')
      blocks.push(`<p style="font-size: 14px; color: #1b2426; line-height: 1.6; margin: 0 0 10px;">${portalUrl ? `<a href="${portalUrl}" style="color:${primaryColor};">${text}</a>` : text}</p>`)
      continue
    }
    if (m.key !== 'other') parts.push(`<strong>${EN_METHOD_LABELS[m.key] || m.key}</strong>`)
    for (const line of m.lines) {
      parts.push(line.label ? `${EN_LINE_LABELS[line.label] || line.label}: ${escapeHtml(line.value)}` : escapeHtml(line.value).replace(/\n/g, '<br/>'))
    }
    if (m.link) {
      if (m.key === 'card_external') {
        parts.push(`<a href="${m.link}" style="display:inline-block; background:${primaryColor}; color:white; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:600;">${escapeHtml(m.linkLabel || 'Pay by card')}</a>`)
      } else {
        parts.push(`<a href="${m.link}" style="color:${primaryColor};">${escapeHtml(m.link)}</a>`)
      }
    }
    const qrImg = m.qr_path ? `<img src="cid:qr-${m.key}" width="96" height="96" style="display:block; margin-top:6px; border:1px solid #eee; border-radius:6px;" alt="" />` : ''
    blocks.push(`<p style="font-size: 14px; color: #1b2426; line-height: 1.6; margin: 0 0 10px;">${parts.join('<br/>')}</p>${qrImg}`)
  }
  return `
    <div style="margin: 20px 0; padding: 16px; background: #f9fafb; border-radius: 8px;">
      <h3 style="color: ${primaryColor}; font-size: 14px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px;">${heading}</h3>
      ${blocks.join('')}
    </div>
  `
}

// Inline QR attachments for Resend (content_id referenced by cid: in the HTML).
async function buildQrAttachments(adminClient: ReturnType<typeof createClient>, pi: Record<string, unknown> | null) {
  const attachments: { filename: string; content: string; content_id: string }[] = []
  for (const m of buildPaymentMethods(pi)) {
    if (!m.qr_path) continue
    try {
      const { data } = await adminClient.storage.from('payment-qr').download(m.qr_path)
      if (!data) continue
      const buf = new Uint8Array(await data.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      attachments.push({ filename: m.qr_path.split('/').pop() || `${m.key}.png`, content: btoa(bin), content_id: `qr-${m.key}` })
    } catch { /* image simply omitted */ }
  }
  return attachments
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // 1. Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing auth' }, 401)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await anonClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Invalid auth' }, 401)

    // 2. Parse input
    const { invoice_id, pdf_base64 } = await req.json()
    if (!invoice_id) return json({ error: 'invoice_id required' }, 400)
    if (!pdf_base64) return json({ error: 'pdf_base64 required' }, 400)

    // 3. Service-role client
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 4. Fetch invoice + project
    const { data: invoice, error: invErr } = await adminClient
      .from('invoices')
      .select('id, invoice_number, title, status, total, due_date, terms, notes, project_id, company_id, portal_token')
      .eq('id', invoice_id)
      .single()
    if (invErr || !invoice) return json({ error: 'Invoice not found' }, 404)

    // I13: void and paid invoices never go out.
    if (invoice.status === 'void') return json({ error: 'This invoice is void and cannot be sent.' }, 400)
    if (invoice.status === 'paid') return json({ error: 'This invoice is paid and cannot be sent.' }, 400)

    const { data: project, error: projErr } = await adminClient
      .from('projects')
      .select('id, name, address, client_id, company_id, completion_notice_pending')
      .eq('id', invoice.project_id)
      .single()
    if (projErr || !project) return json({ error: 'Project not found' }, 404)

    // 5. Verify caller is in the same company. A verified super admin bypasses
    //    the company match (so impersonated sends succeed); everyone else stays
    //    strictly scoped to their own company.
    const { data: callerProfile } = await adminClient
      .from('user_profiles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single()
    const { data: superAdminRow } = await adminClient
      .from('super_admins')
      .select('email')
      .eq('email', user.email)
      .maybeSingle()
    const isSuperAdmin = !!superAdminRow
    if (!isSuperAdmin && (!callerProfile || callerProfile.company_id !== invoice.company_id)) {
      return json({ error: 'Forbidden' }, 403)
    }
    if (callerProfile?.role !== 'contractor_admin' && !isSuperAdmin) {
      return json({ error: 'Admin access required' }, 403)
    }

    if (!project.client_id) {
      return json({ error: 'Project missing client' }, 400)
    }

    // 6. Fetch client + contacts + company
    const { data: client } = await adminClient
      .from('clients')
      .select('id, display_name, primary_email, client_contacts(email, is_portal_recipient)')
      .eq('id', project.client_id)
      .single()

    const { data: company } = await adminClient
      .from('companies')
      .select('name, primary_color, logo_url, payment_instructions')
      .eq('id', invoice.company_id)
      .single()

    if (!client) return json({ error: 'Client not found' }, 404)

    // 7. Build recipient list
    const flaggedEmails = (client.client_contacts ?? [])
      .filter((c: { is_portal_recipient: boolean; email: string | null }) => c.is_portal_recipient && c.email)
      .map((c: { email: string }) => c.email)
    const fallback = client.primary_email ? [client.primary_email] : []
    const recipients = Array.from(new Set([...flaggedEmails, ...fallback]))

    if (recipients.length === 0) return json({ error: 'No email recipients' }, 400)

    // 8. Build email
    const siteUrl = Deno.env.get('SITE_URL') || 'https://app.rivetdog.com'
    const portalUrl = invoice.portal_token ? `${siteUrl}/portal/invoice/${invoice.portal_token}` : null
    const companyName = company?.name || 'Your Contractor'
    const tenantPrimary = company?.primary_color || '#f27243'
    const tenantLogoUrl = company?.logo_url || null
    const invTitle = invoice.title || invoice.invoice_number
    const totalFmt = Number(invoice.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const dueDateFmt = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null

    const logoHtml = tenantLogoUrl
      ? `<img src="${tenantLogoUrl}" alt="${escapeHtml(companyName)} logo" style="max-height: 60px; max-width: 200px; display: block; margin: 0 auto 20px;" />`
      : ''

    const totalRow = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 16px 0; border-collapse: separate; border-spacing: 0;">
      <tr>
        <td style="padding: 14px 16px; background: #1b2426; border-radius: 8px 0 0 8px; color: #ffffff; font-size: 15px; font-weight: 600;">Invoice Total</td>
        <td style="padding: 14px 16px; background: #1b2426; border-radius: 0 8px 8px 0; color: ${tenantPrimary}; font-size: 20px; font-weight: 700; font-family: monospace; text-align: right; white-space: nowrap;">$${totalFmt}</td>
      </tr>
    </table>`

    const dueHtml = dueDateFmt
      ? `<p style="font-size: 14px; color: #555; line-height: 1.5;">
          <strong style="color: ${tenantPrimary};">Payment due by ${dueDateFmt}</strong>
        </p>`
      : ''

    const portalBtnHtml = portalUrl
      ? `<a href="${portalUrl}" style="display: inline-block; margin: 16px 0; padding: 14px 28px; background: ${tenantPrimary}; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">View Invoice Online</a>`
      : ''

    // Pending completion notice rides this invoice email instead of a
    // separate status email; the flag clears after a successful send.
    const completionBanner = project.completion_notice_pending
      ? `<p style="font-size: 15px; color: #1b2426; line-height: 1.5; padding: 12px 16px; background: #f0faf1; border-left: 3px solid #16a34a; border-radius: 8px;">
          Your project <strong>${escapeHtml(project.name)}</strong> is complete. Thank you for choosing ${escapeHtml(companyName)}. Your final invoice is below.
        </p>`
      : ''

    const qrAttachments = await buildQrAttachments(adminClient, company?.payment_instructions)

    // Payments block: every ledger payment, paid to date, balance due — so a
    // resend after a partial payment leads with the real balance.
    const { data: ledgerPayments } = await adminClient
      .from('invoice_payments')
      .select('amount, payment_method, payment_date, reference_number')
      .eq('invoice_id', invoice_id)
      .order('payment_date', { ascending: true })
    const paidToDate = Math.round((ledgerPayments ?? []).reduce((s: number, p: { amount: number }) => s + (Number(p.amount) || 0), 0) * 100) / 100
    const balanceDue = Math.round(((Number(invoice.total) || 0) - paidToDate) * 100) / 100
    const fmtM = (v: number) => `$${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const paymentsBlockHtml = (ledgerPayments ?? []).length > 0 ? `
      <table style="width:100%; border-collapse:collapse; font-size:13px; margin:12px 0;">
        <thead><tr>
          <th style="text-align:left; padding:6px 8px; font-size:11px; color:#777; text-transform:uppercase;">Date</th>
          <th style="text-align:left; padding:6px 8px; font-size:11px; color:#777; text-transform:uppercase;">Method</th>
          <th style="text-align:left; padding:6px 8px; font-size:11px; color:#777; text-transform:uppercase;">Reference</th>
          <th style="text-align:right; padding:6px 8px; font-size:11px; color:#777; text-transform:uppercase;">Amount</th>
        </tr></thead>
        <tbody>${(ledgerPayments ?? []).map((p: { payment_date: string; payment_method: string | null; reference_number: string | null; amount: number }) => `
          <tr>
            <td style="padding:6px 8px; border-bottom:1px solid #eee;">${p.payment_date ? new Date(p.payment_date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee; text-transform:capitalize;">${escapeHtml((p.payment_method || '').replace(/_/g, ' '))}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee; color:#777;">${escapeHtml(p.reference_number || '')}</td>
            <td style="padding:6px 8px; border-bottom:1px solid #eee; text-align:right; font-family:monospace;">${fmtM(Number(p.amount) || 0)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="3" style="padding:6px 8px; font-weight:600;">Paid to date</td><td style="padding:6px 8px; text-align:right; font-family:monospace;">${fmtM(paidToDate)}</td></tr>
          <tr><td colspan="3" style="padding:6px 8px; font-weight:700;">${balanceDue > 0 ? 'Balance due' : 'Paid in full'}</td><td style="padding:6px 8px; text-align:right; font-family:monospace; font-weight:700; color:${balanceDue > 0 ? '#dc2626' : '#16a34a'};">${fmtM(Math.max(0, balanceDue))}</td></tr>
        </tfoot>
      </table>` : ''

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        ${logoHtml}
        <h2 style="color: ${tenantPrimary}; margin: 0 0 16px 0;">${escapeHtml(companyName)}</h2>
        ${completionBanner}
        <p style="font-size: 15px; color: #1b2426; line-height: 1.5;">
          You've received an invoice: <strong>${escapeHtml(invTitle)}</strong>
        </p>
        <p style="font-size: 14px; color: #555; line-height: 1.5;">
          ${escapeHtml(invoice.invoice_number)} for project <strong>${escapeHtml(project.name)}</strong>
        </p>
        ${totalRow}
        ${paymentsBlockHtml}
        ${dueHtml}
        ${renderPaymentInstructionsHTML(company?.payment_instructions, tenantPrimary, 'Payment Methods', portalUrl)}
        <p style="font-size: 14px; color: #555; line-height: 1.5;">
          View your invoice and download a PDF copy:
        </p>
        ${portalBtnHtml}
        <p style="font-size: 13px; color: #888; margin-top: 24px;">A PDF copy is attached to this email. Have questions? Contact ${escapeHtml(companyName)} directly.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 11px; color: #999; text-align: center;">Powered by RivetDog</p>
      </div>
    `

    // 9. Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${companyName} via RivetDog <noreply@rivetdog.com>`,
        to: recipients,
        subject: `Invoice from ${companyName} — ${escapeHtml(invTitle)}`,
        html,
        attachments: [
          {
            filename: `${invTitle.replace(/[^a-zA-Z0-9_\- ]/g, '')}.pdf`,
            content: pdf_base64,
          },
          ...qrAttachments,
        ],
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('Resend failed', errText)
      return json({ error: 'Email send failed' }, 502)
    }

    // Completion notice delivered with this invoice: clear the pending flag.
    if (project.completion_notice_pending) {
      await adminClient
        .from('projects')
        .update({ completion_notice_pending: false, updated_at: new Date().toISOString() })
        .eq('id', project.id)
    }

    // 10. Update invoice status (draft → sent)
    if (invoice.status === 'draft') {
      await adminClient
        .from('invoices')
        .update({ status: 'sent', sent_at: new Date().toISOString(), delivery_method: 'email', updated_at: new Date().toISOString() })
        .eq('id', invoice_id)
    }

    // 11. Activity log (fire-and-forget)
    if (project.client_id) {
      try {
        await adminClient.from('client_activity').insert({
          client_id: project.client_id,
          company_id: invoice.company_id,
          user_id: user.id,
          activity_type: 'invoice_sent',
          title: `Invoice ${invoice.invoice_number} sent`,
          is_automated: true,
          metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number, recipient_count: recipients.length },
        })
      } catch (err) {
        console.warn('Failed to log invoice_sent activity:', err)
      }
    }

    return json({ success: true, recipientCount: recipients.length })

  } catch (err) {
    console.error('send-invoice-email error', err)
    return json({ error: 'Internal error' }, 500)
  }
})

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
