// Recurly webhook edge function.
// Auth: query-param secret (Recurly sends Basic Auth in the Authorization header,
// which collides with Supabase's gateway Bearer requirement — so we use ?secret= instead).
// Body: Recurly sends XML. Parsed via lightweight regex extraction.
// Logs ALL events to recurly_webhook_events. Sends cancel/reactivation emails via Resend.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('RECURLY_WEBHOOK_SECRET')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// Recurly notification types → our subscription_status values.
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

// ── XML extraction helpers (lightweight regex — no external dependency) ──

function xmlTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  return re.exec(xml)?.[1]?.trim() || undefined;
}

function xmlRootElement(xml: string): string {
  const match = /^[\s\S]*?<(\w+)[\s>]/.exec(xml);
  return match?.[1] ?? 'unknown';
}

function parseRecurlyXml(xml: string) {
  const eventType = xmlRootElement(xml);
  const accountCode = xmlTag(xml, 'account_code');
  const subscriptionUuid = xmlTag(xml, 'uuid');
  const subscriptionState = xmlTag(xml, 'state');
  return { eventType, accountCode, subscriptionUuid, subscriptionState };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let eventType = '';
  let companyId: string | undefined;
  let subId: string | undefined;
  let newStatus: string | undefined;
  let rawPayload: string | undefined;

  try {
    // 1. Query-param secret gate
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    const expected = Deno.env.get('RECURLY_WEBHOOK_SECRET');
    if (!secret || secret !== expected) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 2. Parse XML body
    const xmlBody = await req.text();
    rawPayload = xmlBody;
    const parsed = parseRecurlyXml(xmlBody);
    eventType = parsed.eventType;
    companyId = parsed.accountCode;
    subId = parsed.subscriptionUuid;

    // 3. Service-role client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 4. Map event to status
    newStatus = STATUS_MAP[eventType];

    if (!companyId) {
      console.warn('[recurly-webhook] No account_code in event:', eventType);
      await logEvent(supabase, { eventType, companyId: null, subId, newStatus, processed: false, error: 'no account_code', rawPayload });
      return new Response('no account_code', { status: 200 });
    }

    // 5. Handle cancel-pending events (cancel at period end — access continues)
    if (CANCEL_PENDING_EVENTS.has(eventType)) {
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

      if (RESEND_API_KEY) {
        await sendCancelEmail(supabase, companyId);
      }

      return new Response('ok', { status: 200 });
    }

    if (!newStatus) {
      await logEvent(supabase, { eventType, companyId, subId, newStatus: null, processed: false, error: null, rawPayload });
      return new Response('ignored: ' + eventType, { status: 200 });
    }

    // Guard: these events should NOT flip a trialing company to active.
    // new_subscription fires when the card-bearing sub is created (with trial) — trial must continue.
    // reactivated/updated fire on mid-trial reactivation — trial must be preserved.
    // renewed fires on a Recurly-side term roll that is not a charge — trial must be preserved.
    // successful_payment (the real first charge at the end of the app-owned trial)
    // is the ONLY event that converts trialing→active.
    //
    // Why renewed matters under the no-card model: the trial is app-owned and
    // its expiry is enforced from companies.trial_ends_at. Any event that
    // reaches the 'active' branch NULLs trial_ends_at (see below), which would
    // leave a trialing company with no expiry at all — unbounded free access,
    // not a lockout, because the gate treats a null trial_ends_at as "nothing
    // to enforce".
    const TRIAL_SAFE_EVENTS = new Set(['new_subscription_notification', 'reactivated_account_notification', 'updated_subscription_notification', 'renewed_subscription_notification']);
    if (newStatus === 'active' && TRIAL_SAFE_EVENTS.has(eventType)) {
      const { data: current } = await supabase
        .from('companies')
        .select('subscription_status')
        .eq('id', companyId)
        .single();
      if (current?.subscription_status === 'trialing') {
        await supabase.from('companies').update({ canceled_at: null, cancel_reason: null }).eq('id', companyId);
        await logEvent(supabase, { eventType, companyId, subId, newStatus: null, processed: true, error: null, rawPayload });
        if (eventType === 'reactivated_account_notification' && RESEND_API_KEY) {
          await sendReactivateEmail(supabase, companyId);
        }
        return new Response('ok', { status: 200 });
      }
    }

    // 6. Build update payload for status-changing events
    const updatePayload: Record<string, unknown> = { subscription_status: newStatus };
    if (subId) {
      updatePayload.recurly_subscription_id = subId;
    }

    if (newStatus === 'active') {
      updatePayload.trial_enabled = false;
      updatePayload.trial_ends_at = null;
    }

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

    // 9. Send reactivation confirmation email
    if (eventType === 'reactivated_account_notification' && RESEND_API_KEY) {
      await sendReactivateEmail(supabase, companyId);
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[recurly-webhook] Unexpected error:', err);
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
  rawPayload: string | unknown;
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
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
