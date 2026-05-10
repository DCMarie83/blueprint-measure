import { createClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const ALERT_EMAIL = 'main@ngautomationhub.com';
const THROTTLE_MINUTES = 15;

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const errorRow = payload.record;

    if (errorRow.severity !== 'critical') {
      return new Response('Not critical, skipping', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const fingerprint = errorRow.error_fingerprint;

    const { data: throttle } = await supabase
      .from('error_alert_throttle')
      .select('last_alerted_at')
      .eq('fingerprint', fingerprint)
      .maybeSingle();

    if (throttle) {
      const minutesSince = (Date.now() - new Date(throttle.last_alerted_at).getTime()) / 60000;
      if (minutesSince < THROTTLE_MINUTES) {
        return new Response('Throttled', { status: 200 });
      }
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'RivetDog Alerts <alerts@blueprintmeasure.com>',
        to: ALERT_EMAIL,
        subject: 'Critical error in RivetDog',
        html: `
          <h2>Critical error detected</h2>
          <p><strong>Message:</strong> ${escapeHtml(errorRow.error_message)}</p>
          <p><strong>Page:</strong> ${escapeHtml(errorRow.page_url)}</p>
          <p><strong>User:</strong> ${errorRow.user_id || 'unauthenticated'}</p>
          <p><strong>Company:</strong> ${errorRow.company_id || 'none'}</p>
          <p><strong>When:</strong> ${errorRow.created_at}</p>
          <pre style="background:#f4f4f4;padding:1rem;border-radius:4px;overflow:auto;">${escapeHtml(errorRow.error_stack || '(no stack)')}</pre>
          <p><a href="https://app.blueprintmeasure.com/admin/errors?id=${errorRow.id}">View in admin portal</a></p>
        `,
      }),
    });

    await supabase
      .from('error_alert_throttle')
      .upsert({ fingerprint, last_alerted_at: new Date().toISOString() });

    return new Response('Alert sent', { status: 200 });
  } catch (err) {
    console.error('[notify-critical-error] Failed:', err);
    return new Response('Error', { status: 500 });
  }
});

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
