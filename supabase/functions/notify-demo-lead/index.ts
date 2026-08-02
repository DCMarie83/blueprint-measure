const GHL_DEMO_LEAD_WEBHOOK_URL = Deno.env.get('GHL_DEMO_LEAD_WEBHOOK_URL');

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const leadRow = payload.record;

    if (!leadRow?.email) {
      console.log('[notify-demo-lead] No email on lead, nothing to forward');
      return new Response('No email, skipping', { status: 200 });
    }

    if (!GHL_DEMO_LEAD_WEBHOOK_URL) {
      console.error('[notify-demo-lead] GHL_DEMO_LEAD_WEBHOOK_URL is not set, skipping forward');
      return new Response('No webhook configured, skipping', { status: 200 });
    }

    // Best effort: the lead row is already saved. A GHL failure must never
    // surface as an error to the trigger, so swallow it and still return 200.
    try {
      const res = await fetch(GHL_DEMO_LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: leadRow.name,
          email: leadRow.email,
          state: leadRow.state,
          demo_path: leadRow.demo_path,
          utm_source: leadRow.utm_source,
          utm_medium: leadRow.utm_medium,
          utm_campaign: leadRow.utm_campaign,
          utm_content: leadRow.utm_content,
          utm_term: leadRow.utm_term,
          source: 'rivetdog_try_demo',
        }),
      });

      if (!res.ok) {
        console.error(`[notify-demo-lead] GHL forward returned ${res.status}`);
      }
    } catch (fetchErr) {
      console.error('[notify-demo-lead] GHL forward failed:', fetchErr);
    }

    return new Response('Lead forwarded', { status: 200 });
  } catch (err) {
    console.error('[notify-demo-lead] Failed:', err);
    return new Response('Error', { status: 500 });
  }
});
