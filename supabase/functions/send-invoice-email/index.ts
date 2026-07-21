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

const PI_ORDER = ['check', 'zelle', 'venmo', 'cashapp', 'ach', 'card_external', 'other']

function renderPaymentInstructionsHTML(pi: Record<string, any> | null, primaryColor: string): string {
  if (!pi) return ''
  const enabled = PI_ORDER.filter(k => pi[k]?.enabled)
  if (enabled.length === 0) return ''
  const lines: string[] = []
  for (const k of enabled) {
    const d = pi[k]
    if (k === 'check') lines.push(`<strong>Check</strong> — Payable to: ${escapeHtml(d.payable_to || '')}${d.mailing_address ? `<br/>Mail to: ${escapeHtml(d.mailing_address).replace(/\n/g, '<br/>')}` : ''}`)
    else if (k === 'zelle') lines.push(`<strong>Zelle:</strong> ${escapeHtml(d.handle || '')}`)
    else if (k === 'venmo') lines.push(`<strong>Venmo:</strong> @${escapeHtml(d.handle || '')}`)
    else if (k === 'cashapp') lines.push(`<strong>Cash App:</strong> $${escapeHtml(d.handle || '')}`)
    else if (k === 'ach') lines.push(`<strong>ACH/Wire:</strong> ${escapeHtml(d.instructions || '').replace(/\n/g, '<br/>')}`)
    else if (k === 'card_external') lines.push(`<a href="${d.url || '#'}" style="display:inline-block; background:${primaryColor}; color:white; padding:10px 16px; border-radius:6px; text-decoration:none; font-weight:600;">${escapeHtml(d.label || 'Pay with Card')}</a>`)
    else if (k === 'other') lines.push(escapeHtml(d.instructions || '').replace(/\n/g, '<br/>'))
  }
  return `
    <div style="margin: 20px 0; padding: 16px; background: #f9fafb; border-radius: 8px;">
      <h3 style="color: ${primaryColor}; font-size: 14px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px;">Payment Methods</h3>
      ${lines.map(l => `<p style="font-size: 14px; color: #1b2426; line-height: 1.6; margin: 0 0 8px;">${l}</p>`).join('')}
    </div>
  `
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

    const { data: project, error: projErr } = await adminClient
      .from('projects')
      .select('id, name, address, client_id, company_id')
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

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        ${logoHtml}
        <h2 style="color: ${tenantPrimary}; margin: 0 0 16px 0;">${escapeHtml(companyName)}</h2>
        <p style="font-size: 15px; color: #1b2426; line-height: 1.5;">
          You've received an invoice: <strong>${escapeHtml(invTitle)}</strong>
        </p>
        <p style="font-size: 14px; color: #555; line-height: 1.5;">
          ${escapeHtml(invoice.invoice_number)} for project <strong>${escapeHtml(project.name)}</strong>
        </p>
        ${totalRow}
        ${dueHtml}
        ${renderPaymentInstructionsHTML(company?.payment_instructions, tenantPrimary)}
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
        ],
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('Resend failed', errText)
      return json({ error: 'Email send failed' }, 502)
    }

    // 10. Update invoice status (draft → sent)
    if (invoice.status === 'draft') {
      await adminClient
        .from('invoices')
        .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
