// admin-user-actions Edge Function
// Handles password reset, suspend/unsuspend, soft-delete, and auth user info lookup.
// Verifies caller is super_admin OR contractor_admin acting on same-tenant user.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing auth' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify caller's identity using their JWT
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser()
    if (authError || !caller) return json({ error: 'Unauthorized' }, 401)

    // Get caller's profile
    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role, company_id')
      .eq('user_id', caller.id)
      .maybeSingle()

    if (!callerProfile) return json({ error: 'Profile not found' }, 403)

    const { data: superAdminRow } = await supabase
      .from('super_admins')
      .select('email')
      .eq('email', caller.email)
      .maybeSingle()
    const isSuperAdmin = !!superAdminRow
    const isContractorAdmin = callerProfile.role === 'contractor_admin'

    if (!isSuperAdmin && !isContractorAdmin) {
      return json({ error: 'Forbidden' }, 403)
    }

    const body = await req.json()
    const { action, target_user_id } = body

    // get_user_info doesn't need target scope check — used to load ban status
    if (action === 'get_user_info') {
      if (!target_user_id) return json({ error: 'target_user_id required' }, 400)

      // Still verify scope for non-super-admins
      if (!isSuperAdmin) {
        const { data: targetProfile } = await supabase
          .from('user_profiles')
          .select('company_id')
          .eq('user_id', target_user_id)
          .maybeSingle()
        if (!targetProfile || targetProfile.company_id !== callerProfile.company_id) {
          return json({ error: 'Forbidden — different tenant' }, 403)
        }
      }

      const { data: { user: targetUser }, error } = await supabase.auth.admin.getUserById(target_user_id)
      if (error) return json({ error: error.message }, 500)
      return json({
        last_sign_in_at: targetUser?.last_sign_in_at ?? null,
        banned_until: targetUser?.banned_until ?? null,
        created_at: targetUser?.created_at ?? null,
      })
    }

    // For all other actions, verify target user scope
    if (!target_user_id) return json({ error: 'target_user_id required' }, 400)

    const { data: targetProfile } = await supabase
      .from('user_profiles')
      .select('user_id, company_id, email, role')
      .eq('user_id', target_user_id)
      .maybeSingle()

    if (!targetProfile) return json({ error: 'Target user not found' }, 404)

    // Contractor admin can only act on same-tenant users, never on super_admin
    if (!isSuperAdmin) {
      if (targetProfile.company_id !== callerProfile.company_id) {
        return json({ error: 'Forbidden — different tenant' }, 403)
      }
      if (targetProfile.role === 'super_admin') {
        return json({ error: 'Forbidden — cannot act on super admin' }, 403)
      }
    }

    if (action === 'reset_password') {
      // Use anon client — admin.generateLink only returns a link, doesn't send email
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!
      )
      const { error } = await anonClient.auth.resetPasswordForEmail(targetProfile.email, {
        redirectTo: 'https://app.rivetdog.com/change-password',
      })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, message: 'Recovery email sent' })
    }

    if (action === 'suspend') {
      const { error } = await supabase.auth.admin.updateUserById(target_user_id, {
        ban_duration: '876000h', // ~100 years
      })
      if (error) return json({ error: error.message }, 500)

      // Revoke live sessions so the ban takes effect immediately
      await supabase.auth.admin.signOut(target_user_id, 'global')

      return json({ ok: true })
    }

    if (action === 'unsuspend') {
      const { error } = await supabase.auth.admin.updateUserById(target_user_id, {
        ban_duration: 'none',
      })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'restore') {
      // Clear soft-delete flag
      const { error: updErr } = await supabase
        .from('user_profiles')
        .update({ deleted_at: null })
        .eq('user_id', target_user_id)
      if (updErr) return json({ error: updErr.message }, 500)

      // Un-ban so the user can log in again
      const { error: banErr } = await supabase.auth.admin.updateUserById(target_user_id, {
        ban_duration: 'none',
      })
      if (banErr) return json({ error: banErr.message }, 500)

      return json({ ok: true })
    }

    if (action === 'soft_delete') {
      // Soft-delete profile
      const { error: updErr } = await supabase
        .from('user_profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', target_user_id)
      if (updErr) return json({ error: updErr.message }, 500)

      // Ban the auth user so they cannot log back in
      await supabase.auth.admin.updateUserById(target_user_id, {
        ban_duration: '876000h', // ~100 years — effectively permanent, reversible via restore
      })

      // Sign user out everywhere
      await supabase.auth.admin.signOut(target_user_id, 'global')

      return json({ ok: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    console.error('[admin-user-actions]', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
