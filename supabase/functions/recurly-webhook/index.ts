// Recurly webhook edge function — mirrors chargebee-webhook structure.
// HTTP Basic Auth verification, maps Recurly notification types to subscription_status.
// Logs ALL events to recurly_webhook_events. Sends cancel email via Resend on cancel.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const WEBHOOK_USER = Deno.env.get('RECURLY_WEBHOOK_USER')!;
const WEBHOOK_PASSWORD = Deno.env.get('RECURLY_WEBHOOK_PASSWORD')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

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

  let eventType = '';
  let companyId: string | undefined;
  let subId: string | undefined;
  let newStatus: string | undefined;
  let rawPayload: unknown;

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
    rawPayload = body;
    eventType = body.event_type ?? '';
    const subscription = body.subscription ?? body.account?.subscription;
    const account = body.account;

    // 3. Resolve company ID from account.code
    companyId =
      account?.code ??
      subscription?.account?.code ??
      body.account_code;

    subId = subscription?.id ?? subscription?.uuid;

    // 4. Service-role client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 5. Map event to status
    newStatus = STATUS_MAP[eventType];

    if (!companyId) {
      console.warn('[recurly-webhook] No company id in event:', eventType);
      await logEvent(supabase, { eventType, companyId: null, subId, newStatus, processed: false, error: 'no company id', rawPayload });
      return new Response('no company id', { status: 200 });
    }

    if (!newStatus) {
      await logEvent(supabase, { eventType, companyId, subId, newStatus: null, processed: false, error: null, rawPayload });
      return new Response('ignored: ' + eventType, { status: 200 });
    }

    // 6. Build update payload
    const updatePayload: Record<string, unknown> = { subscription_status: newStatus };
    if (subId) {
      updatePayload.recurly_subscription_id = subId;
    }

    // On activation, clear stale trial fields
    if (newStatus === 'active') {
      updatePayload.trial_enabled = false;
      updatePayload.trial_ends_at = null;
    }

    // On cancel, record canceled_at if not already set
    if (newStatus === 'canceled') {
      // Only set if not already set (the cancel edge fn may have set it already)
      const { data: existing } = await supabase
        .from('companies')
        .select('canceled_at')
        .eq('id', companyId)
        .single();
      if (!existing?.canceled_at) {
        updatePayload.canceled_at = new Date().toISOString();
      }
    }

    // 7. Update company
    const { error } = await supabase
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId);

    if (error) {
      console.error('[recurly-webhook] DB error:', error.message, { companyId, eventType });
      await logEvent(supabase, { eventType, companyId, subId, newStatus, processed: false, error: error.message, rawPayload });
      return new Response('db error', { status: 500 });
    }

    // 8. Log successful event
    await logEvent(supabase, { eventType, companyId, subId, newStatus, processed: true, error: null, rawPayload });

    // 9. Send cancel confirmation email
    if (newStatus === 'canceled' && RESEND_API_KEY) {
      await sendCancelEmail(supabase, companyId);
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[recurly-webhook] Unexpected error:', err);
    // Best-effort log
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await logEvent(supabase, { eventType, companyId, subId, newStatus, processed: false, error: String(err), rawPayload });
    } catch { /* don't fail on logging failure */ }
    return new Response('error logged', { status: 200 });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────

interface LogParams {
  eventType: string;
  companyId: string | null | undefined;
  subId: string | undefined;
  newStatus: string | null | undefined;
  processed: boolean;
  error: string | null;
  rawPayload: unknown;
}

async function logEvent(supabase: ReturnType<typeof createClient>, p: LogParams) {
  try {
    await supabase.from('recurly_webhook_events').insert({
      event_type: p.eventType || 'unknown',
      account_code: p.companyId || null,
      company_id: p.companyId || null,
      subscription_id: p.subId || null,
      new_status: p.newStatus || null,
      processed: p.processed,
      error: p.error,
      raw_payload: p.rawPayload ?? null,
      received_at: new Date().toISOString(),
    });
  } catch (logErr) {
    console.error('[recurly-webhook] Failed to log event:', logErr);
  }
}

async function sendCancelEmail(supabase: ReturnType<typeof createClient>, companyId: string) {
  try {
    // Get company name + owner email
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single();

    const { data: owner } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('company_id', companyId)
      .limit(1)
      .single();

    if (!owner?.email) {
      console.warn('[recurly-webhook] No owner email for cancel notification, company:', companyId);
      return;
    }

    const companyName = company?.name || 'your company';

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RivetDog <hello@rivetdog.com>',
        to: owner.email,
        subject: 'Your RivetDog subscription has been canceled',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #26464c; margin: 0 0 16px;">Subscription canceled</h2>
            <p style="font-size: 15px; color: #1b2426; line-height: 1.6;">
              The subscription for <strong>${escapeHtml(companyName)}</strong> has been canceled.
            </p>
            <p style="font-size: 15px; color: #1b2426; line-height: 1.6;">
              You'll continue to have full access until the end of your current billing period. After that, your account will become read-only. Your data is safe — you can resubscribe anytime to restore full access.
            </p>
            <p style="font-size: 14px; color: #555; line-height: 1.6; margin-top: 24px;">
              Questions? Contact us at <a href="mailto:hello@rivetdog.com" style="color: #f27243;">hello@rivetdog.com</a>.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="font-size: 11px; color: #999; text-align: center;">RivetDog | NG Automation Hub</p>
          </div>
        `,
      }),
    });
  } catch (emailErr) {
    console.error('[recurly-webhook] Cancel email failed:', emailErr);
    // Non-fatal — don't fail the webhook response
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
