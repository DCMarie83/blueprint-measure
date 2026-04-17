// admin-users Edge Function
// Handles listing, inviting, resending invitations, and deleting auth users.
// Runs on Supabase's servers — the service_role key never reaches the browser.
//
// Deploy via Supabase Dashboard → Edge Functions → admin-users → redeploy
//
// Actions (all via POST with JSON body):
//   { action: 'list' }
//   { action: 'invite',  email, company_id }
//   { action: 'create',  email, password, company_id }
//   { action: 'resend',  email }
//   { action: 'delete',  user_id }

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
    let body: Record<string, unknown> = {}
    try {
      const text = await req.text()
      if (text.trim().length > 0) body = JSON.parse(text)
    } catch {
      return json({ error: 'Invalid JSON in request body' }, 400)
    }
    const action = body.action ?? 'list'

    // ── Step 4: service-role client for admin operations ────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ── list ────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (error) throw error
      return json({ users: data.users })
    }

    // ── invite ──────────────────────────────────────────────────────────────
    // Sends a Supabase invitation email and creates the user_profile row.
    if (action === 'invite') {
      const { email, company_id } = body
      if (!email) return json({ error: 'email is required' }, 400)

      const { data: authData, error: authErr } =
        await adminClient.auth.admin.inviteUserByEmail(email as string)
      if (authErr) throw authErr

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

    // ── create ──────────────────────────────────────────────────────────────
    // Creates a user with a temporary password set by the admin.
    // email_confirm is true so they can log in immediately.
    // force_password_change in user_metadata forces them to change it on first login.
    if (action === 'create') {
      const { email, password, company_id } = body
      if (!email)    return json({ error: 'email is required' }, 400)
      if (!password) return json({ error: 'password is required' }, 400)

      const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        email:          email as string,
        password:       password as string,
        email_confirm:  true,
        user_metadata:  { force_password_change: true },
      })
      if (authErr) throw authErr

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

    // ── set_password ────────────────────────────────────────────────────────
    // Sets a new temporary password for an existing user and re-flags them
    // to change it on next login.
    if (action === 'set_password') {
      const { user_id, new_password } = body
      if (!user_id)      return json({ error: 'user_id is required' }, 400)
      if (!new_password) return json({ error: 'new_password is required' }, 400)

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(
        user_id as string,
        {
          password:      new_password as string,
          user_metadata: { force_password_change: true },
        }
      )
      if (updateErr) throw updateErr

      return json({ success: true })
    }

    // ── resend ──────────────────────────────────────────────────────────────
    // Re-sends the invitation email to a user who hasn't accepted yet.
    // Does NOT touch user_profiles — the row already exists from the first invite.
    if (action === 'resend') {
      const { email } = body
      if (!email) return json({ error: 'email is required' }, 400)

      const { error: inviteErr } =
        await adminClient.auth.admin.inviteUserByEmail(email as string)
      if (inviteErr) throw inviteErr

      return json({ success: true })
    }

    // ── delete ──────────────────────────────────────────────────────────────
    // Removes the user_profile row then permanently deletes the auth account.
    if (action === 'delete') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id is required' }, 400)

      await adminClient.from('user_profiles').delete().eq('user_id', user_id)

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
