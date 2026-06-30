import { createClient } from 'jsr:@supabase/supabase-js@2';

const WEBHOOK_USER = Deno.env.get('CHARGEBEE_WEBHOOK_USER')!;
const WEBHOOK_PASSWORD = Deno.env.get('CHARGEBEE_WEBHOOK_PASSWORD')!;

const STATUS_MAP: Record<string, string> = {
  subscription_activated: 'active',
  subscription_created: 'active',
  subscription_reactivated: 'active',
  payment_succeeded: 'active',
  subscription_renewed: 'active',
  subscription_resumed: 'active',
  subscription_cancelled: 'canceled',
  payment_failed: 'past_due',
  subscription_changed_to_dunning: 'past_due',
  subscription_paused: 'paused',
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

    // 2. Parse body
    const body = await req.json();
    const eventType: string = body.event_type ?? '';
    const subscription = body.content?.subscription;
    const customer = body.content?.customer;

    // 3. Resolve company id (Chargebee customer id == our company id)
    const companyId: string | undefined = customer?.id ?? subscription?.customer_id;
    if (!companyId) {
      console.warn('[chargebee-webhook] No company id in event:', eventType);
      return new Response('no company id', { status: 200 });
    }

    // 4. Map event to status
    const newStatus = STATUS_MAP[eventType];
    if (!newStatus) {
      return new Response('ignored: ' + eventType, { status: 200 });
    }

    // 5. Capture chargebee subscription id
    const subId: string | undefined = subscription?.id;

    // 6. Service-role client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 7. Update company
    const updatePayload: Record<string, unknown> = { subscription_status: newStatus };
    if (subId) {
      updatePayload.chargebee_subscription_id = subId;
    }

    const { error } = await supabase
      .from('companies')
      .update(updatePayload)
      .eq('id', companyId);

    if (error) {
      console.error('[chargebee-webhook] DB error:', error.message, { companyId, eventType });
      return new Response('db error', { status: 500 });
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[chargebee-webhook] Unexpected error:', err);
    return new Response('error logged', { status: 200 });
  }
});
