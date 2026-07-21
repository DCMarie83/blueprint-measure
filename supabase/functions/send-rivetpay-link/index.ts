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
    if (!authHeader) return json({ ok: false, error: 'Missing auth' }, 401)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await anonClient.auth.getUser()
    if (userErr || !user) return json({ ok: false, error: 'Invalid auth' }, 401)

    // 2. Parse input
    const { crewMemberId, email } = await req.json()
    if (!crewMemberId) return json({ ok: false, error: 'crewMemberId required' }, 400)
    if (!email) return json({ ok: false, error: 'email required' }, 400)

    // 3. Service-role client
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 4. Load crew member
    const { data: cm, error: cmErr } = await adminClient
      .from('crew_members')
      .select('id, company_id, name, link_token, link_enabled')
      .eq('id', crewMemberId)
      .single()
    if (cmErr || !cm) return json({ ok: false, error: 'Crew member not found' }, 404)

    // 5. Verify caller is super admin or contractor_admin in same company
    const { data: superAdminRow } = await adminClient
      .from('super_admins')
      .select('email')
      .eq('email', user.email)
      .maybeSingle()
    const isSuperAdmin = !!superAdminRow
    if (!isSuperAdmin) {
      const { data: callerProfile } = await adminClient
        .from('user_profiles')
        .select('company_id, role')
        .eq('user_id', user.id)
        .single()
      if (!callerProfile || callerProfile.company_id !== cm.company_id || callerProfile.role !== 'contractor_admin') {
        return json({ ok: false, error: 'Forbidden' }, 403)
      }
    }

    // 6. Check link is enabled
    if (!cm.link_enabled) {
      return json({ ok: false, error: 'Link is disabled' })
    }

    // 7. Build link URL (same base as send-portal-email)
    const siteUrl = Deno.env.get('SITE_URL') || 'https://app.rivetdog.com'
    const linkUrl = `${siteUrl}/rivetpay/${cm.link_token}`

    // 8. Load company name
    const { data: company } = await adminClient
      .from('companies')
      .select('name')
      .eq('id', cm.company_id)
      .single()
    const companyName = company?.name || 'Your Employer'

    // 9. Send via Resend
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #f27243; margin: 0 0 16px 0;">${escapeHtml(companyName)}</h2>
        <p style="font-size: 15px; color: #1b2426; line-height: 1.5;">
          Hi ${escapeHtml(cm.name)},
        </p>
        <p style="font-size: 14px; color: #555; line-height: 1.5;">
          Here's your clock-in/out link for <strong>${escapeHtml(companyName)}</strong>. Use it to log your hours on the job.
        </p>
        <a href="${linkUrl}" style="display: inline-block; margin: 16px 0; padding: 12px 24px; background: #f27243; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Clock In / Out</a>
        <p style="font-size: 13px; color: #888; margin-top: 24px;">
          For best results, open this link in Safari or Chrome.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 11px; color: #999; text-align: center;">Powered by RivetDog</p>
      </div>
    `

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${companyName} via RivetDog <noreply@rivetdog.com>`,
        to: email,
        subject: `${companyName}: your clock-in link`,
        html,
      }),
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error('Resend failed', errText)
      return json({ ok: false, error: 'Email send failed' }, 502)
    }

    return json({ ok: true })

  } catch (err) {
    console.error('send-rivetpay-link error', err)
    return json({ ok: false, error: 'Internal error' }, 500)
  }
})

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
