// Recurly checkout edge function — Phase 0 proof-of-charge.
// Creates a Recurly account + subscription using a billing token from Recurly.js.
// Enforces the lifetime-lock price from companies.locked_price_monthly.

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

async function recurlyFetch(path: string, method: string, body?: unknown) {
  const res = await fetch(`${RECURLY_BASE}${path}`, {
    method,
    headers: RECURLY_HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
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
    const billingToken: string | undefined = body.billing_token;
    const companyId: string | undefined = body.company_id;
    const threeDSResultToken: string | undefined = body.three_d_secure_action_result_token_id;

    if (!billingToken || !companyId) {
      return json({ error: 'billing_token and company_id are required' }, 400);
    }

    // 3. Service-role client
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 4. Resolve company + locked price
    const { data: company, error: compErr } = await adminClient
      .from('companies')
      .select('id, name, plan_key, locked_price_monthly, canceled_at, recurly_account_code')
      .eq('id', companyId)
      .single();
    if (compErr || !company) return json({ error: 'Company not found' }, 404);

    // 4a. No plan assigned -> .eq('key', null) returns zero rows and .single()
    // fails, which would surface below as the misleading 'missing
    // recurly_plan_code'. Name the real cause instead.
    if (!company.plan_key) {
      return json({ error: 'company has no plan assigned' }, 400);
    }

    // 4b. Resolve the company's plan — the Recurly plan code comes from data,
    // never hardcoded. A plan without a recurly_plan_code is not billable.
    const { data: plan } = await adminClient
      .from('plans')
      .select('recurly_plan_code, monthly_price')
      .eq('key', company.plan_key)
      .single();
    if (!plan || !plan.recurly_plan_code) {
      return json({ error: 'plan is not billable: missing recurly_plan_code' }, 400);
    }

    // 4c. Effective price: per-company lock first, else the plan's live price.
    // Always sent as unit_amount — the override is how app-side pricing
    // (including future promo prices) reaches Recurly without dashboard edits.
    const effectivePrice = company.locked_price_monthly ?? plan.monthly_price;
    if (effectivePrice == null) {
      return json({ error: 'No price available — locked_price_monthly and plan.monthly_price are both null' }, 400);
    }

    // 5. Get owner email for Recurly account
    const { data: ownerProfile } = await adminClient
      .from('user_profiles')
      .select('email')
      .eq('company_id', companyId)
      .limit(1)
      .single();
    const accountEmail = ownerProfile?.email || user.email || '';

    // 6. Build billing_info with optional 3DS result
    const billingInfo: Record<string, unknown> = { token_id: billingToken };
    if (threeDSResultToken) {
      billingInfo.three_d_secure_action_result_token_id = threeDSResultToken;
    }

    // 7. Create or update Recurly account with billing info
    const accountBody = {
      code: companyId,
      email: accountEmail,
      company: company.name || undefined,
      billing_info: billingInfo,
    };

    let acctRes = await recurlyFetch('/accounts', 'POST', accountBody);

    if (!acctRes.ok && acctRes.status === 422) {
      // Account already exists — update billing info instead
      const updateBody = {
        email: accountEmail,
        company: company.name || undefined,
        billing_info: billingInfo,
      };
      acctRes = await recurlyFetch(`/accounts/code-${companyId}`, 'PUT', updateBody);
      if (!acctRes.ok) {
        console.error('[recurly-checkout] Account update failed:', acctRes.data);
        return json({ error: acctRes.data?.error?.message || 'Failed to update Recurly account' }, 502);
      }
    } else if (!acctRes.ok) {
      console.error('[recurly-checkout] Account create failed:', acctRes.data);
      return json({ error: acctRes.data?.error?.message || 'Failed to create Recurly account' }, 502);
    }

    // 8. Create subscription with the effective price override
    const unitAmount = Number(effectivePrice);
    const isReturning = company.canceled_at != null || company.recurly_account_code != null;
    const subBody: Record<string, unknown> = {
      plan_code: plan.recurly_plan_code,
      account: { code: companyId },
      currency: 'USD',
      unit_amount: unitAmount,
    };
    // Skip trial for returning subscribers — billing starts immediately.
    // Recurly v3 subscription create accepts trial_ends_at as an ISO 8601 timestamp;
    // setting it to now effectively skips the plan's configured trial.
    if (isReturning) {
      subBody.trial_ends_at = new Date().toISOString();
    }

    const subRes = await recurlyFetch('/subscriptions', 'POST', subBody);

    // 9. Handle 3DS challenge required
    if (!subRes.ok && subRes.data?.error?.type === 'three_d_secure_action_required') {
      const actionTokenId = subRes.data.error.three_d_secure_action_token_id;
      return json({
        requires_3ds: true,
        three_d_secure_action_token_id: actionTokenId,
      });
    }

    if (!subRes.ok) {
      console.error('[recurly-checkout] Subscription create failed:', subRes.data);
      const msg = subRes.data?.error?.message || subRes.data?.error?.params?.[0]?.message || 'Subscription creation failed';
      return json({ error: msg }, 502);
    }

    // 10. Success — write Recurly IDs to companies
    const subscription = subRes.data;
    const { error: dbErr } = await adminClient
      .from('companies')
      .update({
        recurly_account_code: companyId,
        recurly_subscription_id: subscription.id || subscription.uuid,
        awaiting_recurly_card: false,
      })
      .eq('id', companyId);

    if (dbErr) {
      console.error('[recurly-checkout] DB update failed:', dbErr.message);
      // Subscription was created in Recurly — don't fail the response
    }

    return json({
      success: true,
      subscription_id: subscription.id || subscription.uuid,
      status: subscription.state || subscription.status,
    });

  } catch (err) {
    console.error('[recurly-checkout] Unexpected error:', err);
    return json({ error: String(err) }, 500);
  }
});
