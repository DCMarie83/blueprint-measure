// admin-users Edge Function
// Handles listing auth users and creating new auth users.
// Runs on Supabase's servers — the service_role key never reaches the browser.
//
// Deploy via Supabase Dashboard → Edge Functions → New Function
// or: supabase functions deploy admin-users
//
// Actions (all via POST with JSON body):
//   { action: 'list' }
//   { action: 'create', email, password, company_id }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAIL = 'main@ngautomationhub.com'

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
  // Handle CORS pre-flight requests (browsers send these before every POST)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // ── Step 1: verify the caller is logged in ──────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    // Use the caller's own JWT to look up who they are.
    // SUPABASE_URL and SUPABASE_ANON_KEY are built-in env vars in every
    // Supabase Edge Function — no secrets file needed.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    // ── Step 2: verify the caller is the admin ──────────────────────────────
    if (user.email !== ADMIN_EMAIL) {
      return json({ error: 'Forbidden' }, 403)
    }

    // ── Step 3: parse the request body ─────────────────────────────────────
    const body = await req.json()
    const { action } = body

    // ── Step 4: build a service-role client for admin operations ───────────
    // SUPABASE_SERVICE_ROLE_KEY is also a built-in env var — Supabase injects
    // it automatically. It never appears in any frontend code or env file.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ── Action: list all auth users ─────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (error) throw error
      return json({ users: data.users })
    }

    // ── Action: create a new auth user + user_profile row ───────────────────
    if (action === 'create') {
      const { email, password, company_id } = body

      if (!email || !password) {
        return json({ error: 'email and password are required' }, 400)
      }

      // Create the Supabase auth account
      const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // lets them log in immediately without a confirmation email
      })
      if (authErr) throw authErr

      // Link the new user to their company in user_profiles
      const { error: profileErr } = await adminClient
        .from('user_profiles')
        .insert({
          user_id:    authData.user.id,
          company_id: company_id || null,
          email:      authData.user.email,
        })
      if (profileErr) throw profileErr

      return json({ user: authData.user })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
