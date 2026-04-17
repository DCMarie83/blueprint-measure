// admin-users Edge Function
// Handles listing, inviting, creating, resending, setting passwords, and deleting auth users.
// Runs on Supabase's servers — the service_role key never reaches the browser.

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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    if (user.email !== ADMIN_EMAIL) {
      return json({ error: 'Forbidden' }, 403)
    }

    let body: Record<string, unknown> = {}
    try {
      const text = await req.text()
      if (text.trim().length > 0) body = JSON.parse(text)
    } catch {
      return json({ error: 'Invalid JSON in request body' }, 400)
    }
    const action = body.action ?? 'list'

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    if (action === 'list') {
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (error) throw error
      return json({ users: data.users })
    }

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

    if (action === 'create') {
      const { email, password, company_id } = body
      if (!email)    return json({ error: 'email is required' }, 400)
      if (!password) return json({ error: 'password is required' }, 400)

      const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
        email:         email as string,
        password:      password as string,
        email_confirm: true,
        user_metadata: { force_password_change: true },
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

    if (action === 'resend') {
      const { email } = body
      if (!email) return json({ error: 'email is required' }, 400)

      const { error: inviteErr } =
        await adminClient.auth.admin.inviteUserByEmail(email as string)
      if (inviteErr) throw inviteErr

      return json({ success: true })
    }

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