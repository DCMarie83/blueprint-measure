// Recurly webhook edge function — mirrors chargebee-webhook structure.
// HTTP Basic Auth verification, maps Recurly notification types to subscription_status.
// Logs ALL events to recurly_webhook_events. Sends cancel/reactivation emails via Resend.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const WEBHOOK_USER = Deno.env.get('RECURLY_WEBHOOK_USER')!;
const WEBHOOK_PASSWORD = Deno.env.get('RECURLY_WEBHOOK_PASSWORD')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// Recurly v3 webhook notification types → our subscription_status values.
// NOTE: canceled_subscription_notification is handled SEPARATELY (cancel-at-period-end
// means access continues — we record canceled_at but don't change subscription_status
// until the subscription actually expires).
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
  // Expired (period ended — NOW lock access)
  'expired_subscription_notification': 'canceled',
  'subscription_expired_notification': 'canceled',
};

// Events that signal a pending cancel (access continues until period end).
const CANCEL_PENDING_EVENTS = new Set(['canceled_subscription_notification']);

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

    // 6. Handle cancel-pending events (cancel at period end — access continues)
    if (CANCEL_PENDING_EVENTS.has(eventType)) {
      // Write canceled_at only (do NOT change subscription_status — user keeps access)
      const { data: existing } = await supabase
        .from('companies')
        .select('canceled_at')
        .eq('id', companyId)
        .single();

      if (!existing?.canceled_at) {
        const { error } = await supabase
          .from('companies')
          .update({ canceled_at: new Date().toISOString() })
          .eq('id', companyId);
        if (error) {
          console.error('[recurly-webhook] DB error (cancel pending):', error.message, { companyId, eventType });
          await logEvent(supabase, { eventType, companyId, subId, newStatus: null, processed: false, error: error.message, rawPayload });
          return new Response('db error', { status: 500 });
        }
      }

      await logEvent(supabase, { eventType, companyId, subId, newStatus: null, processed: true, error: null, rawPayload });

      // Send cancel confirmation email
      if (RESEND_API_KEY) {
        await sendCancelEmail(supabase, companyId);
      }

      return new Response('ok', { status: 200 });
    }

    if (!newStatus) {
      await logEvent(supabase, { eventType, companyId, subId, newStatus: null, processed: false, error: null, rawPayload });
      return new Response('ignored: ' + eventType, { status: 200 });
    }

    // Guard: reactivated/updated events should NOT flip a trialing company to active
    // (that would clear trial fields prematurely). Only payment-driven events convert trial→paid.
    const REACTIVATE_EVENTS = new Set(['reactivated_account_notification', 'updated_subscription_notification']);
    if (newStatus === 'active' && REACTIVATE_EVENTS.has(eventType)) {
      const { data: current } = await supabase
        .from('companies')
        .select('subscription_status')
        .eq('id', companyId)
        .single();
      if (current?.subscription_status === 'trialing') {
        // Clear canceled_at (reactivation) but preserve trial state
        await supabase.from('companies').update({ canceled_at: null, cancel_reason: null }).eq('id', companyId);
        await logEvent(supabase, { eventType, companyId, subId, newStatus: null, processed: true, error: null, rawPayload });
        if (eventType === 'reactivated_account_notification' && RESEND_API_KEY) {
          await sendReactivateEmail(supabase, companyId);
        }
        return new Response('ok', { status: 200 });
      }
    }

    // 7. Build update payload for status-changing events
    const updatePayload: Record<string, unknown> = { subscription_status: newStatus };
    if (subId) {
      updatePayload.recurly_subscription_id = subId;
    }

    // On activation, clear stale trial fields
    if (newStatus === 'active') {
      updatePayload.trial_enabled = false;
      updatePayload.trial_ends_at = null;
    }

    // On expiry (period ended), record canceled_at if not already set
    if (newStatus === 'canceled') {
      const { data: existing } = await supabase
        .from('companies')
        .select('canceled_at')
        .eq('id', companyId)
        .single();
      if (!existing?.canceled_at) {
        updatePayload.canceled_at = new Date().toISOString();
      }
    }

    // 8. Update company
    const { error } = await supabase
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId);

    if (error) {
      console.error('[recurly-webhook] DB error:', error.message, { companyId, eventType });
      await logEvent(supabase, { eventType, companyId, subId, newStatus, processed: false, error: error.message, rawPayload });
      return new Response('db error', { status: 500 });
    }

    // 9. Log successful event
    await logEvent(supabase, { eventType, companyId, subId, newStatus, processed: true, error: null, rawPayload });

    // 10. Send reactivation confirmation email
    if (eventType === 'reactivated_account_notification' && RESEND_API_KEY) {
      await sendReactivateEmail(supabase, companyId);
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

async function sendReactivateEmail(supabase: ReturnType<typeof createClient>, companyId: string) {
  try {
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
      console.warn('[recurly-webhook] No owner email for reactivation notification, company:', companyId);
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
        subject: 'Your RivetDog subscription is active again',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #26464c; margin: 0 0 16px;">Subscription reactivated</h2>
            <p style="font-size: 15px; color: #1b2426; line-height: 1.6;">
              The subscription for <strong>${escapeHtml(companyName)}</strong> has been reactivated. Billing will continue as normal on your regular billing cycle.
            </p>
            <p style="font-size: 15px; color: #1b2426; line-height: 1.6;">
              You have full access to all features. No further action is needed.
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
    console.error('[recurly-webhook] Reactivation email failed:', emailErr);
    // Non-fatal — don't fail the webhook response
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
