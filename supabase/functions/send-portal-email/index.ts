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
    const { project_id } = await req.json()
    if (!project_id) return json({ error: 'project_id required' }, 400)

    // 3. Service-role client
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 4. Fetch project
    const { data: project, error: projErr } = await adminClient
      .from('projects')
      .select('id, name, address, portal_token, client_id, company_id, user_id')
      .eq('id', project_id)
      .single()
    if (projErr || !project) return json({ error: 'Project not found' }, 404)

    // 5. Verify caller is in the same company
    const { data: callerProfile } = await adminClient
      .from('user_profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single()
    if (!callerProfile || callerProfile.company_id !== project.company_id) {
      return json({ error: 'Forbidden' }, 403)
    }

    if (!project.client_id || !project.portal_token) {
      return json({ error: 'Project missing client or portal token' }, 400)
    }

    // 6. Fetch client + flagged contacts + company name
    const { data: client } = await adminClient
      .from('clients')
      .select('id, display_name, primary_email, client_contacts(email, is_portal_recipient)')
      .eq('id', project.client_id)
      .single()

    const { data: company } = await adminClient
      .from('companies')
      .select('name')
      .eq('id', project.company_id)
      .single()

    if (!client) return json({ error: 'Client not found' }, 404)

    // 7. Build recipient list (flagged contacts → primary_email fallback, deduplicated)
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

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #f27243; margin: 0 0 16px 0;">${escapeHtml(companyName)}</h2>
        <p style="font-size: 15px; color: #1b2426; line-height: 1.5;">
          Your project <strong>${escapeHtml(project.name)}</strong> is scheduled.
        </p>
        ${project.address ? `<p style="font-size: 14px; color: #555;">${escapeHtml(project.address)}</p>` : ''}
        <p style="font-size: 14px; color: #555; line-height: 1.5;">
          Track your project status, view updates, and stay informed at the link below:
        </p>
        <a href="${portalUrl}" style="display: inline-block; margin: 16px 0; padding: 12px 24px; background: #f27243; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">View Your Project Portal</a>
        <p style="font-size: 13px; color: #888; margin-top: 24px;">Have questions? Contact ${escapeHtml(companyName)} directly.</p>
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
        from: 'RivetDog <noreply@rivetdog.com>',
        to: recipients,
        subject: `Your project update from ${companyName}`,
        html,
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('Resend failed', errText)
      return json({ error: 'Email send failed' }, 502)
    }

    // 10. Mark sent
    await adminClient
      .from('projects')
      .update({ portal_email_sent_at: new Date().toISOString() })
      .eq('id', project_id)

    return json({ success: true, recipientCount: recipients.length })

  } catch (err) {
    console.error('send-portal-email error', err)
    return json({ error: 'Internal error' }, 500)
  }
})

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
