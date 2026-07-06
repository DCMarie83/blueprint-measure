// mark-company-internal Edge Function
// Toggles companies.is_internal and adjusts plan_state_quotas.signup_count.
// Super-admin only. Idempotent — no-ops if the flag already matches.

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

// Plan keys that consumed a quota slot on signup.
const QUOTA_PLAN_KEYS = new Set(['founding_500', 'early_adopters']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing auth' }, 401)

    // Service-role client for privileged operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify caller identity via JWT
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser()
    if (authError || !caller) return json({ error: 'Unauthorized' }, 401)

    // Super-admin check via super_admins table
    const { data: superAdminRow } = await supabase
      .from('super_admins')
      .select('email')
      .eq('email', caller.email)
      .maybeSingle()
    if (!superAdminRow) return json({ error: 'Forbidden' }, 403)

    // Parse input
    const body = await req.json()
    const companyId: string | undefined = body.company_id
    const internal: boolean | undefined = body.internal
    if (!companyId || typeof internal !== 'boolean') {
      return json({ error: 'company_id (string) and internal (boolean) are required' }, 400)
    }

    // Load company
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('id, plan_id, plan_key, state, is_internal')
      .eq('id', companyId)
      .single()
    if (compErr || !company) return json({ error: 'Company not found' }, 404)

    // Idempotent guard — no-op if already in the requested state
    if (internal === company.is_internal) {
      return json({ ok: true, changed: false, is_internal: company.is_internal })
    }

    // Determine whether this company consumed a quota slot
    const hasQuota = QUOTA_PLAN_KEYS.has(company.plan_key) && company.plan_id && company.state
    let quotaAdjusted = false

    if (hasQuota) {
      // Read the current quota row (two-step read+write since the JS client
      // doesn't support SQL expressions like GREATEST in .update())
      const { data: quota } = await supabase
        .from('plan_state_quotas')
        .select('id, signup_count')
        .eq('plan_id', company.plan_id)
        .eq('state', company.state)
        .single()

      if (quota) {
        const newCount = internal
          ? Math.max(0, quota.signup_count - 1)  // marking internal → free the spot
          : quota.signup_count + 1               // unmarking → restore the consumed spot

        await supabase
          .from('plan_state_quotas')
          .update({ signup_count: newCount, updated_at: new Date().toISOString() })
          .eq('id', quota.id)
        quotaAdjusted = true
      }
    }

    // Update the company's is_internal flag
    const { error: updErr } = await supabase
      .from('companies')
      .update({ is_internal: internal })
      .eq('id', companyId)
    if (updErr) return json({ error: 'Failed to update company: ' + updErr.message }, 500)

    return json({ ok: true, changed: true, is_internal: internal, quota_adjusted: quotaAdjusted })

  } catch (err) {
    console.error('[mark-company-internal]', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
