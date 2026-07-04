// Recurly webhook edge function — mirrors chargebee-webhook structure.
// HTTP Basic Auth verification, maps Recurly notification types to subscription_status.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const WEBHOOK_USER = Deno.env.get('RECURLY_WEBHOOK_USER')!;
const WEBHOOK_PASSWORD = Deno.env.get('RECURLY_WEBHOOK_PASSWORD')!;

// Recurly v3 webhook notification types → our subscription_status values.
const STATUS_MAP: Record<string, string> = {
  // Active
  'new_subscription_notification': 'active',
  'renewed_subscription_notification': 'active',
  'reactivated_account_notification': 'active',
  'updated_subscription_notification': 'active',
  'successful_payment_notification': 'active',
  // Past due
  'failed_payment_notification': 'past_due',
  'past_due_subscription_renewal_notification': 'past_due',
  // Canceled / expired
  'canceled_subscription_notification': 'canceled',
  'expired_subscription_notification': 'canceled',
  'subscription_expired_notification': 'canceled',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // 1. Basic-auth gate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const providedToken = authHeader.slice(6);
    const expectedToken = btoa(WEBHOOK_USER + ':' + WEBHOOK_PASSWORD);

    if (providedToken !== expectedToken) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 2. Parse body — Recurly v3 webhooks send JSON
    const body = await req.json();
    const eventType: string = body.event_type ?? '';
    const subscription = body.subscription ?? body.account?.subscription;
    const account = body.account;

    // 3. Resolve company ID from account.code
    const companyId: string | undefined =
      account?.code ??
      subscription?.account?.code ??
      body.account_code;

    if (!companyId) {
      console.warn('[recurly-webhook] No company id in event:', eventType);
      return new Response('no company id', { status: 200 });
    }

    // 4. Map event to status
    const newStatus = STATUS_MAP[eventType];
    if (!newStatus) {
      return new Response('ignored: ' + eventType, { status: 200 });
    }

    // 5. Capture subscription ID
    const subId: string | undefined =
      subscription?.id ?? subscription?.uuid;

    // 6. Service-role client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 7. Update company — mirrors chargebee-webhook behavior
    const updatePayload: Record<string, unknown> = { subscription_status: newStatus };
    if (subId) {
      updatePayload.recurly_subscription_id = subId;
    }
    // On activation, clear stale trial fields
    if (newStatus === 'active') {
      updatePayload.trial_enabled = false;
      updatePayload.trial_ends_at = null;
    }

    const { error } = await supabase
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId);

    if (error) {
      console.error('[recurly-webhook] DB error:', error.message, { companyId, eventType });
      return new Response('db error', { status: 500 });
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[recurly-webhook] Unexpected error:', err);
    return new Response('error logged', { status: 200 });
  }
});
