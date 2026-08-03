// Single source of truth for brand strings, support contacts, and domain references.
// Update here when DNS migrates next week.

export const BRAND = {
  name: 'RivetDog',
  tagline: 'Reliable · Trades First',
  legalEntity: 'NG Automation Hub LLC',
};

export const SUPPORT = {
  email: 'support@rivetdog.com',
  fromEmail: 'noreply@rivetdog.com',
  fromName: 'RivetDog',
};

export const DOMAINS = {
  app: 'app.rivetdog.com',
  marketing: 'rivetdog.com',
};

export const FEATURE_FLAGS = {
  whiteLabel: false,
};

// Days of full access after trial_ends_at before hard lock.
export const TRIAL_GRACE_DAYS = 3;

// Google Ads global tag ID (public — used for conversion events later).
export const GOOGLE_ADS_TAG_ID = 'AW-18297721330';

// Google Ads signup_completed conversion label (the string after AW-18297721330/).
export const GOOGLE_ADS_SIGNUP_CONVERSION_LABEL = '73_wCPj00MwcEPKjhJVE';

// Time & Pay Lite conversion label — null until Dee supplies the real label.
// Covers the whole timepay_lite* family (founders, next tier, future state
// promos); the tracker branches on the plan_key prefix, not one exact key.
// While null, Lite signups fire NO conversion and conversion_fired_at stays
// unset, so early Lite signups still convert once the label lands.
export const GOOGLE_ADS_TIMEPAY_CONVERSION_LABEL = null;
export const GOOGLE_ADS_TIMEPAY_CONVERSION_VALUE = 24.99;

// /try demo-lead Google Ads conversion label — the label fired when a visitor
// submits the /try email gate (a demo_leads capture, distinct from signup).
// null until Dee supplies the real label; while null the demo fires NO
// conversion (same dormant pattern as the Lite label above), so the /try funnel
// never contaminates the founders/Lite conversion actions.
export const GOOGLE_ADS_DEMO_LEAD_CONVERSION_LABEL = null;

// Recurly public key (browser-safe, Recurly.js).
export const RECURLY_PUBLIC_KEY = 'ewr1-5FyjbrwzjnEJiFBVHibzyZ';

// PostHog product analytics — PUBLIC, browser-safe by design (the project API
// key is a write-only ingest key, not a secret). Paste the real key here; while
// POSTHOG_KEY is empty, initAnalytics() no-ops and capture() silently does
// nothing, so no analytics initialize until the key lands.
export const POSTHOG_KEY = '';
export const POSTHOG_HOST = 'https://us.i.posthog.com';

// Founder-spots scarcity: show the live remaining count only at or below this
// number. Above it, show the cap statement instead ("Only N spots per state")
// — a nearly-full count reads as scarcity, a full count reads as vacancy.
// Also drives the /try demo end screen.
export const FOUNDER_SPOTS_SCARCITY_THRESHOLD = 10;

// GHL onboarding booking calendar (public link).
export const ONBOARDING_CALENDAR_URL = 'https://api.leadconnectorhq.com/widget/booking/JqBPdsARvHo9H7xbnu0q';

// Time & Pay Lite sandbox company — the one-click super-admin demo tenant. Paste
// the real sandbox company UUID here to enable the "Time & Pay Lite sandbox"
// UserMenu shortcut. While null/empty the menu item does not render, so no
// half-wired impersonation is ever offered.
export const LITE_SANDBOX_COMPANY_ID = 'fc966571-44d7-422d-a0e7-a192d37e4668';
