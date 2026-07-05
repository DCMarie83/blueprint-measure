// Recurly cancel edge function — cancels subscription at end of current billing period.
// Uses PUT /subscriptions/{id}/cancel (not /terminate — access continues until period end).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RECURLY_API_KEY = Deno.env.get('RECURLY_API_KEY')!;
const RECURLY_BASE = 'https://v3.recurly.com';
// Accept-Language EXPLICITLY pinned — Deno's fetch injects 'Accept-Language: *'
// when unset, and Recurly rejects '*'. Do NOT remove this header.
const RECURLY_HEADERS = {
  'Authorization': 'Basic ' + btoa(RECURLY_API_KEY + ':'),
  'Accept': 'application/vnd.recurly.v2021-02-25',
  'Content-Type': 'application/json',
  'Accept-Language': 'en-US',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // 1. Auth: validate caller JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing auth' }, 401);

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Invalid auth' }, 401);

    // 2. Parse input
    const body = await req.json();
    const companyId: string | undefined = body.company_id;
    const reason: string | undefined = body.reason;
    if (!companyId) return json({ error: 'company_id is required' }, 400);

    // 3. Service-role client
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 4. Verify caller is admin/owner of this company OR super_admin
    const { data: superAdminRow } = await adminClient
      .from('super_admins')
      .select('email')
      .eq('email', user.email)
      .maybeSingle();
    const isSuperAdmin = !!superAdminRow;

    if (!isSuperAdmin) {
      const { data: profile } = await adminClient
        .from('user_profiles')
        .select('company_id, role')
        .eq('user_id', user.id)
        .single();
      if (!profile || profile.company_id !== companyId || profile.role !== 'contractor_admin') {
        return json({ error: 'Forbidden: only company admins can cancel' }, 403);
      }
    }

    // 5. Get recurly_subscription_id
    const { data: company, error: compErr } = await adminClient
      .from('companies')
      .select('id, recurly_subscription_id')
      .eq('id', companyId)
      .single();
    if (compErr || !company) return json({ error: 'Company not found' }, 404);

    if (!company.recurly_subscription_id) {
      return json({ error: 'No active Recurly subscription to cancel' }, 400);
    }

    // 6. Cancel in Recurly (at end of current billing period)
    const cancelRes = await fetch(
      `${RECURLY_BASE}/subscriptions/${company.recurly_subscription_id}/cancel`,
      { method: 'PUT', headers: RECURLY_HEADERS },
    );

    if (!cancelRes.ok) {
      const errData = await cancelRes.json().catch(() => ({}));
      const msg = (errData as any)?.error?.message || `Recurly cancel failed (${cancelRes.status})`;
      console.error('[recurly-cancel] Recurly error:', msg);
      return json({ error: msg }, 502);
    }

    // 7. Record cancel_reason + canceled_at locally (webhook sets subscription_status)
    const updatePayload: Record<string, unknown> = {
      canceled_at: new Date().toISOString(),
    };
    if (reason) updatePayload.cancel_reason = reason;

    await adminClient
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId);

    // 8. Also record on user_profiles for audit trail
    await adminClient
      .from('user_profiles')
      .update({ subscription_cancel_requested_at: new Date().toISOString() })
      .eq('user_id', user.id);

    return json({ success: true });

  } catch (err) {
    console.error('[recurly-cancel] Unexpected error:', err);
    return json({ error: String(err) }, 500);
  }
});
