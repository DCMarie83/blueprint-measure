// admin-users Edge Function
// Handles listing, inviting, and deleting auth users.
// Runs on Supabase's servers — the service_role key never reaches the browser.
//
// Deploy via Supabase Dashboard → Edge Functions → admin-users → redeploy
// or: supabase functions deploy admin-users
//
// Actions (all via POST with JSON body):
//   { action: 'list' }
//   { action: 'invite', email, company_id }
//   { action: 'delete', user_id }

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

    // ── Step 3: safely parse the request body ───────────────────────────────
    // req.json() throws on an empty body, so read raw text first.
    // A missing/empty body defaults to action: 'list'.
    let body: Record<string, unknown> = {}
    try {
      const text = await req.text()
      if (text.trim().length > 0) {
        body = JSON.parse(text)
      }
    } catch {
      return json({ error: 'Invalid JSON in request body' }, 400)
    }
    const action = body.action ?? 'list'

    // ── Step 4: build a service-role client for admin operations ───────────
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

    // ── Action: invite a new user by email ──────────────────────────────────
    // Sends a Supabase invitation email. The user clicks the link to set their
    // own password — we never handle or store a password on their behalf.
    if (action === 'invite') {
      const { email, company_id } = body

      if (!email) {
        return json({ error: 'email is required' }, 400)
      }

      const { data: authData, error: authErr } =
        await adminClient.auth.admin.inviteUserByEmail(email as string)
      if (authErr) throw authErr

      // Link the invited user to their company in user_profiles.
      // The user row exists immediately in auth.users even before they accept.
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

    // ── Action: delete a user ───────────────────────────────────────────────
    // Deletes the user_profile row first, then the auth account.
    // user_profiles has ON DELETE CASCADE so the profile would auto-delete
    // anyway, but being explicit avoids any timing edge cases.
    if (action === 'delete') {
      const { user_id } = body

      if (!user_id) {
        return json({ error: 'user_id is required' }, 400)
      }

      // Remove the profile row (ignore error if it doesn't exist)
      await adminClient
        .from('user_profiles')
        .delete()
        .eq('user_id', user_id)

      // Delete the auth account — this is permanent
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user_id as string)
      if (deleteErr) throw deleteErr

      return json({ success: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
