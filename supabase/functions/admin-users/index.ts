// admin-users Edge Function
// Handles listing, inviting, creating, resending, setting passwords, and deleting auth users.
// Runs on Supabase's servers — the service_role key never reaches the browser.
//
// Permissions:
//   super_admin (ADMIN_EMAIL) — all actions, any company
//   contractor_admin — invite/create/resend to own company only
//   contractor_user — rejected (403)

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

    // Validate caller identity via JWT
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !caller) return json({ error: 'Unauthorized' }, 401)

    // Service-role client for privileged operations
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Resolve caller's role and company
    const isSuperAdmin = caller.email === ADMIN_EMAIL
    let callerRole: string | null = null
    let callerCompanyId: string | null = null

    if (!isSuperAdmin) {
      const { data: profile } = await adminClient
        .from('user_profiles')
        .select('role, company_id')
        .eq('user_id', caller.id)
        .single()

      callerRole = profile?.role ?? null
      callerCompanyId = profile?.company_id ?? null

      if (callerRole !== 'contractor_admin') {
        return json({ error: 'Forbidden: only admins can manage users' }, 403)
      }
      if (!callerCompanyId) {
        return json({ error: 'Forbidden: no company associated with your account' }, 403)
      }
    }

    let body: Record<string, unknown> = {}
    try {
      const text = await req.text()
      if (text.trim().length > 0) body = JSON.parse(text)
    } catch {
      return json({ error: 'Invalid JSON in request body' }, 400)
    }
    const action = body.action ?? 'list'

    // Resolve the target company_id:
    // - super_admin: uses body.company_id (can target any company)
    // - contractor_admin: always uses their own company_id (ignores body.company_id)
    const targetCompanyId = isSuperAdmin
      ? (body.company_id as string || null)
      : callerCompanyId

    // ── list ──────────────────────────────────────────────────────────────────
    if (action === 'list') {
      if (!isSuperAdmin) {
        return json({ error: 'Forbidden: only super admin can list all users' }, 403)
      }
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (error) throw error
      return json({ users: data.users })
    }

    // ── invite ────────────────────────────────────────────────────────────────
    if (action === 'invite') {
      const { email } = body
      if (!email) return json({ error: 'email is required' }, 400)

      const { data: authData, error: authErr } =
        await adminClient.auth.admin.inviteUserByEmail(email as string)
      if (authErr) throw authErr

      const { error: profileErr } = await adminClient
        .from('user_profiles')
        .insert({
          user_id:    authData.user.id,
          company_id: targetCompanyId,
          email:      authData.user.email,
        })
      if (profileErr) throw profileErr

      return json({ user: authData.user })
    }

    // ── create ────────────────────────────────────────────────────────────────
    if (action === 'create') {
      const { email, password } = body
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
          company_id: targetCompanyId,
          email:      authData.user.email,
        })
      if (profileErr) throw profileErr

      return json({ user: authData.user })
    }

    // ── set_password ──────────────────────────────────────────────────────────
    if (action === 'set_password') {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id is required' }, 400)
      const { new_password } = body
      if (!new_password) return json({ error: 'new_password is required' }, 400)

      // contractor_admin: verify target user is in same company
      if (!isSuperAdmin) {
        const { data: target } = await adminClient
          .from('user_profiles')
          .select('company_id')
          .eq('user_id', user_id)
          .single()
        if (!target || target.company_id !== callerCompanyId) {
          return json({ error: 'Forbidden: user not in your company' }, 403)
        }
      }

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

    // ── resend ────────────────────────────────────────────────────────────────
    if (action === 'resend') {
      const { email } = body
      if (!email) return json({ error: 'email is required' }, 400)

      // contractor_admin: verify target user is in same company
      if (!isSuperAdmin) {
        const { data: target } = await adminClient
          .from('user_profiles')
          .select('company_id')
          .eq('email', email)
          .maybeSingle()
        if (!target || target.company_id !== callerCompanyId) {
          return json({ error: 'Forbidden: user not in your company' }, 403)
        }
      }

      const { error: inviteErr } =
        await adminClient.auth.admin.inviteUserByEmail(email as string)
      if (inviteErr) throw inviteErr

      return json({ success: true })
    }

    // ── delete ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!isSuperAdmin) {
        return json({ error: 'Forbidden: only super admin can delete users' }, 403)
      }

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
