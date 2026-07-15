import { supabase } from './supabase';
import { getBreadcrumbs, clearBreadcrumbs, addBreadcrumb } from './breadcrumbs';

function computeFingerprint(error) {
  const msg = (error?.message || String(error)).split('\n')[0].slice(0, 200);
  const stack = error?.stack || '';
  const firstFrame = stack
    .split('\n')
    .slice(1)
    .find(line => line.trim() && !line.includes('<anonymous>')) || '';
  return `${msg}::${firstFrame.trim().slice(0, 200)}`;
}

export async function logError(error, severity = 'error', extraContext = {}) {
  try {
    if (extraContext && Object.keys(extraContext).length > 0) {
      addBreadcrumb({
        category: 'custom',
        message: 'Error context',
        data: extraContext,
      });
    }

    const breadcrumbs = getBreadcrumbs();
    const fingerprint = computeFingerprint(error);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    let tenantId = null;
    if (userId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id')
        .eq('user_id', userId)
        .maybeSingle();
      tenantId = profile?.company_id || null;
    }

    // Location context — zero-cost client signals, no network call, no permission prompt.
    // Timezone (e.g. "Asia/Bangkok" vs "America/New_York") distinguishes internal
    // testing from real-market users.
    let timezone = null;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { /* noop */ }
    const locale = navigator.language || null;
    const viewport = `${window.innerWidth}x${window.innerHeight}`;

    const errorRow = {
      company_id: tenantId,
      user_id: userId,
      severity,
      error_message: (error?.message || String(error)).slice(0, 2000),
      error_stack: (error?.stack || null)?.slice(0, 10000) || null,
      component_stack: (error?.componentStack || null)?.slice(0, 5000) || null,
      page_url: window.location.href,
      user_agent: navigator.userAgent,
      breadcrumbs,
      error_fingerprint: fingerprint,
      timezone,
      locale,
      viewport,
    };

    const { error: insertError } = await supabase
      .from('client_errors')
      .insert(errorRow);

    if (insertError) {
      console.warn('[logError] Failed to insert error row:', insertError);
    } else {
      clearBreadcrumbs();
    }
  } catch (loggerError) {
    console.warn('[logError] Logger itself failed:', loggerError);
  }
}
