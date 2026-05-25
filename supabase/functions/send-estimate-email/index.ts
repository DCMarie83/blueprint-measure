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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // 1. Auth: validate caller JWT
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
    const { estimate_id, pdf_base64, selected_variant } = await req.json()
    if (!estimate_id) return json({ error: 'estimate_id required' }, 400)
    if (!pdf_base64) return json({ error: 'pdf_base64 required' }, 400)

    // 3. Service-role client
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 4. Fetch estimate + project
    const { data: estimate, error: estErr } = await adminClient
      .from('estimates')
      .select('id, estimate_number, title, status, good_total, better_total, best_total, notes, deposit_amount, project_id, company_id')
      .eq('id', estimate_id)
      .single()
    if (estErr || !estimate) return json({ error: 'Estimate not found' }, 404)

    const { data: project, error: projErr } = await adminClient
      .from('projects')
      .select('id, name, address, portal_token, client_id, company_id')
      .eq('id', estimate.project_id)
      .single()
    if (projErr || !project) return json({ error: 'Project not found' }, 404)

    // 5. Verify caller is in the same company
    const { data: callerProfile } = await adminClient
      .from('user_profiles')
      .select('company_id, role')
      .eq('user_id', user.id)
      .single()
    if (!callerProfile || callerProfile.company_id !== estimate.company_id) {
      return json({ error: 'Forbidden' }, 403)
    }
    if (callerProfile.role !== 'contractor_admin' && user.email !== 'main@ngautomationhub.com') {
      return json({ error: 'Admin access required' }, 403)
    }

    if (!project.client_id || !project.portal_token) {
      return json({ error: 'Project missing client or portal token' }, 400)
    }

    // 6. Fetch client + contacts + company
    const { data: client } = await adminClient
      .from('clients')
      .select('id, display_name, primary_email, client_contacts(email, is_portal_recipient)')
      .eq('id', project.client_id)
      .single()

    const { data: company } = await adminClient
      .from('companies')
      .select('name, primary_color, logo_url')
      .eq('id', estimate.company_id)
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
    const portalUrl = `${siteUrl}/portal/${project.portal_token}`
    const companyName = company?.name || 'Your Contractor'
    const tenantPrimary = company?.primary_color || '#f27243'
    const tenantLogoUrl = company?.logo_url || null
    const estTitle = estimate.title || estimate.estimate_number

    // Build total display — single variant or all 3
    const totalMap: Record<string, number> = { good: Number(estimate.good_total || 0), better: Number(estimate.better_total || 0), best: Number(estimate.best_total || 0) }
    const selectedTotal = selected_variant ? totalMap[selected_variant] : null
    const totalHtml = selectedTotal != null
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 16px 0; border-collapse: separate; border-spacing: 0;">
           <tr>
             <td style="padding: 14px 16px; background: #1b2426; border-radius: 8px 0 0 8px; color: #ffffff; font-size: 15px; font-weight: 600;">Estimate Total</td>
             <td style="padding: 14px 16px; background: #1b2426; border-radius: 0 8px 8px 0; color: ${tenantPrimary}; font-size: 20px; font-weight: 700; font-family: monospace; text-align: right; white-space: nowrap;">$${selectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
           </tr>
         </table>`
      : `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 8px 12px; background: #f5f5f5; border-radius: 4px 0 0 0;">Option 1</td><td style="padding: 8px 12px; background: #f5f5f5; text-align: right; border-radius: 0 4px 0 0;">$${totalMap.good.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td style="padding: 8px 12px;">Option 2</td><td style="padding: 8px 12px; text-align: right;">$${totalMap.better.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td style="padding: 8px 12px; background: #f5f5f5; border-radius: 0 0 0 4px; font-weight: 600;">Option 3</td><td style="padding: 8px 12px; background: #f5f5f5; text-align: right; font-weight: 600; border-radius: 0 0 4px 0;">$${totalMap.best.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        </table>`

    // Build deposit display
    const depositAmount = Number(estimate.deposit_amount || 0)
    const refTotalForDeposit = selected_variant
      ? Number(estimate[`${selected_variant}_total`] || 0)
      : Number(estimate.better_total || 0)
    const depositPct = (depositAmount > 0 && refTotalForDeposit > 0)
      ? Math.round((depositAmount / refTotalForDeposit) * 100)
      : null
    const depositFmt = depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const depositHtml = depositAmount > 0
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 0 0 16px 0; border-collapse: separate; border-spacing: 0;">
           <tr>
             <td style="padding: 12px 16px; background: #f5f5f5; border-radius: 8px 0 0 8px; color: #1b2426; font-size: 14px; font-weight: 600;">Deposit Required${depositPct != null ? ` <span style="color: #6b7280; font-weight: 400; font-size: 13px;">(${depositPct}%)</span>` : ''}</td>
             <td style="padding: 12px 16px; background: #f5f5f5; border-radius: 0 8px 8px 0; color: ${tenantPrimary}; font-size: 16px; font-weight: 700; font-family: monospace; text-align: right; white-space: nowrap;">$${depositFmt}</td>
           </tr>
         </table>`
      : ''

    const logoHtml = tenantLogoUrl
      ? `<img src="${tenantLogoUrl}" alt="${escapeHtml(companyName)} logo" style="max-height: 60px; max-width: 200px; display: block; margin: 0 auto 20px;" />`
      : ''

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        ${logoHtml}
        <h2 style="color: ${tenantPrimary}; margin: 0 0 16px 0;">${escapeHtml(companyName)}</h2>
        <p style="font-size: 15px; color: #1b2426; line-height: 1.5;">
          You've received an estimate: <strong>${escapeHtml(estTitle)}</strong>
        </p>
        <p style="font-size: 14px; color: #555; line-height: 1.5;">
          ${escapeHtml(estimate.estimate_number)} for project <strong>${escapeHtml(project.name)}</strong>
        </p>
        ${totalHtml}
        ${depositHtml}
        <p style="font-size: 14px; color: #555; line-height: 1.5;">
          View the full estimate and approve online:
        </p>
        <a href="${portalUrl}" style="display: inline-block; margin: 16px 0; padding: 14px 28px; background: ${tenantPrimary}; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">View &amp; Approve Online</a>
        <p style="font-size: 13px; color: #888; margin-top: 24px;">A PDF copy is attached to this email. Have questions? Contact ${escapeHtml(companyName)} directly.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 11px; color: #999; text-align: center;">Powered by RivetDog</p>
      </div>
    `

    // 9. Send via Resend with PDF attachment
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${companyName} via RivetDog <noreply@rivetdog.com>`,
        to: recipients,
        subject: `Estimate from ${companyName} — ${escapeHtml(estTitle)}`,
        html,
        attachments: [
          {
            filename: `${estTitle.replace(/[^a-zA-Z0-9_\- ]/g, '')}.pdf`,
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

    // 10. Update estimate status + enable portal
    const updatePatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (selected_variant) {
      updatePatch.selected_variant = selected_variant
    }
    if (estimate.status === 'draft') {
      updatePatch.status = 'sent'
      updatePatch.sent_at = new Date().toISOString()
    }

    await adminClient
      .from('estimates')
      .update(updatePatch)
      .eq('id', estimate_id)

    // Auto-enable portal on project
    await adminClient
      .from('projects')
      .update({ portal_enabled: true })
      .eq('id', project.id)

    return json({ success: true, recipientCount: recipients.length })

  } catch (err) {
    console.error('send-estimate-email error', err)
    return json({ error: 'Internal error' }, 500)
  }
})

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
