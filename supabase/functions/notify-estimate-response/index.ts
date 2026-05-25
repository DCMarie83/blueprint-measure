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
    const { estimate_id } = await req.json()
    if (!estimate_id) return json({ error: 'estimate_id required' }, 400)

    // Service-role client (this is a public endpoint — security via validation below)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 1. Fetch estimate
    const { data: estimate, error: estErr } = await adminClient
      .from('estimates')
      .select('id, estimate_number, title, status, good_total, better_total, best_total, project_id, company_id, response_notified_at')
      .eq('id', estimate_id)
      .single()
    if (estErr || !estimate) return json({ error: 'Estimate not found' }, 404)

    // 2. Validate status is accepted or declined
    if (!['accepted', 'declined'].includes(estimate.status)) {
      return json({ error: 'Estimate status is not accepted or declined' }, 400)
    }

    // 3. Replay protection: response_notified_at must be NULL or older than 90s
    if (estimate.response_notified_at) {
      const elapsed = Date.now() - new Date(estimate.response_notified_at).getTime()
      if (elapsed < 90_000) {
        return json({ error: 'Notification already sent recently' }, 429)
      }
    }

    // 4. Fetch project + contractor user_id
    const { data: project } = await adminClient
      .from('projects')
      .select('id, name, user_id, client_id')
      .eq('id', estimate.project_id)
      .single()
    if (!project) return json({ error: 'Project not found' }, 404)

    // 5. Fetch contractor's email via auth.users
    const { data: { user: contractor }, error: userErr } = await adminClient.auth.admin.getUserById(project.user_id)
    if (userErr || !contractor?.email) {
      console.error('Could not fetch contractor email', userErr)
      return json({ error: 'Contractor email not found' }, 404)
    }

    // 6. Fetch client name + company name
    let clientName = 'Your client'
    if (project.client_id) {
      const { data: client } = await adminClient
        .from('clients')
        .select('display_name')
        .eq('id', project.client_id)
        .single()
      if (client) clientName = client.display_name
    }

    const { data: company } = await adminClient
      .from('companies')
      .select('name')
      .eq('id', estimate.company_id)
      .single()
    const companyName = company?.name || 'Your Company'

    // 7. Build email
    const estTitle = estimate.title || estimate.estimate_number
    const statusVerb = estimate.status === 'accepted' ? 'accepted' : 'declined'
    const statusColor = estimate.status === 'accepted' ? '#16a34a' : '#dc2626'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://app.rivetdog.com'
    const estimateUrl = `${siteUrl}/estimates/${estimate.id}`

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #f27243; margin: 0 0 16px 0;">${escapeHtml(companyName)}</h2>
        <p style="font-size: 16px; color: #1b2426; line-height: 1.5;">
          Your estimate has been <strong style="color: ${statusColor};">${statusVerb}</strong>
        </p>
        <p style="font-size: 14px; color: #555; line-height: 1.5;">
          <strong>${escapeHtml(clientName)}</strong> ${statusVerb} estimate
          <strong>${escapeHtml(estTitle)}</strong> for project
          <strong>${escapeHtml(project.name)}</strong>.
        </p>
        <a href="${estimateUrl}" style="display: inline-block; margin: 16px 0; padding: 12px 24px; background: #f27243; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">View Estimate</a>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 11px; color: #999; text-align: center;">Powered by RivetDog</p>
      </div>
    `

    // 8. Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${companyName} via RivetDog <noreply@rivetdog.com>`,
        to: [contractor.email],
        subject: `Estimate ${statusVerb}: ${escapeHtml(estTitle)} from ${escapeHtml(clientName)}`,
        html,
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('Resend failed', errText)
      return json({ error: 'Notification email failed' }, 502)
    }

    // 9. Mark notified
    await adminClient
      .from('estimates')
      .update({ response_notified_at: new Date().toISOString() })
      .eq('id', estimate_id)

    return json({ success: true })

  } catch (err) {
    console.error('notify-estimate-response error', err)
    return json({ error: 'Internal error' }, 500)
  }
})

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
