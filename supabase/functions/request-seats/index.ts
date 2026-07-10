// request-seats Edge Function
// Sends a seat-request notification email to the super-admin.
// Called by contractors who need more seats than their plan allows.
// No DB writes — email notification only (payment flow comes later).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const ADMIN_EMAIL = 'main@ngautomationhub.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    // Validate caller identity via JWT
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !caller) return json({ error: 'Unauthorized' }, 401)

    // Service-role client for reads
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Load caller's profile to get company_id
    const { data: profile } = await adminClient
      .from('user_profiles')
      .select('company_id')
      .eq('user_id', caller.id)
      .single()

    if (!profile?.company_id) {
      return json({ error: 'No company associated with your account' }, 400)
    }

    // Load company details
    const { data: company } = await adminClient
      .from('companies')
      .select('name, state, plan_key, seat_limit_override, plan_id, subscription_status, is_internal')
      .eq('id', profile.company_id)
      .single()

    if (!company) {
      return json({ error: 'Company not found' }, 404)
    }

    // Resolve effective seat limit
    let maxSeats = company.seat_limit_override
    if (maxSeats == null && company.plan_id) {
      const { data: plan } = await adminClient
        .from('plans')
        .select('max_seats')
        .eq('id', company.plan_id)
        .single()
      maxSeats = plan?.max_seats ?? null
    }
    const limit = maxSeats ?? 2

    // Count active seats
    const { count } = await adminClient
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', profile.company_id)
      .is('deleted_at', null)
    const used = count ?? 0

    // Send email via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      console.error('[request-seats] RESEND_API_KEY not configured')
      return json({ error: 'Email service not configured' }, 500)
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RivetDog <alerts@rivetdog.com>',
        to: ADMIN_EMAIL,
        subject: `Seat request: ${company.name}`,
        html: `
          <h2>Seat Request</h2>
          <p><strong>${company.name}</strong> needs more seats.</p>
          <table style="border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Requester</td><td style="padding:4px 0;">${caller.email}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Company</td><td style="padding:4px 0;">${company.name}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666;">State</td><td style="padding:4px 0;">${company.state ?? '—'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Plan</td><td style="padding:4px 0;">${company.plan_key ?? 'Legacy'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#666;">Seats</td><td style="padding:4px 0;">${used} of ${limit} used</td></tr>
          </table>
          <p>
            <a href="https://app.rivetdog.com/admin/companies" style="display:inline-block;padding:10px 20px;background:#f27243;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
              Open Companies Admin
            </a>
          </p>
          <p style="font-size:13px;color:#888;">
            To add seats, edit the company's seat limit override in the admin portal.
          </p>
        `,
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      console.error('[request-seats] Resend failed:', errText)
      return json({ error: 'Failed to send request email' }, 500)
    }

    return json({ ok: true })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[request-seats]', err)
    return json({ error: message }, 500)
  }
})
