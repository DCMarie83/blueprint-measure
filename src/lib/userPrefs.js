const DEFAULTS = Object.freeze({
  language: 'en',
  timezone: null,
  date_format: 'US',
  time_format: '12h',
  first_day_of_week: 'sunday',
  measurement_units: 'imperial',
  email_client: 'system',
});

export function detectBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function resolveUserPrefs(userProfile) {
  const p = userProfile || {};
  return {
    language: p.language || DEFAULTS.language,
    timezone: p.timezone || detectBrowserTimezone(),
    date_format: p.date_format || DEFAULTS.date_format,
    time_format: p.time_format || DEFAULTS.time_format,
    first_day_of_week: p.first_day_of_week || DEFAULTS.first_day_of_week,
    measurement_units: p.measurement_units || DEFAULTS.measurement_units,
    email_client: p.email_client || DEFAULTS.email_client,
  };
}

export async function updateUserPrefs(supabase, userId, partial) {
  const { data, error } = await supabase
    .from('user_profiles')
    .update(partial)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export const PREF_OPTIONS = Object.freeze({
  language: [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
  ],
  date_format: [
    { value: 'US', label: 'US (MM/DD/YYYY)' },
    { value: 'ISO', label: 'ISO (YYYY-MM-DD)' },
  ],
  time_format: [
    { value: '12h', label: '12-hour' },
    { value: '24h', label: '24-hour' },
  ],
  first_day_of_week: [
    { value: 'sunday', label: 'Sunday' },
    { value: 'monday', label: 'Monday' },
  ],
  email_client: [
    { value: 'system', label: 'System default' },
    { value: 'gmail', label: 'Gmail on the web' },
    { value: 'outlook', label: 'Outlook on the web' },
  ],
  measurement_units: [
    { value: 'imperial', label: 'Imperial (ft, in)' },
    { value: 'metric', label: 'Metric (m, cm)' },
  ],
});
