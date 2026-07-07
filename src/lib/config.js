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
export const GOOGLE_ADS_SIGNUP_CONVERSION_LABEL = 'REPLACE_WITH_LABEL';

// Recurly public key (browser-safe, Recurly.js).
export const RECURLY_PUBLIC_KEY = 'ewr1-5FyjbrwzjnEJiFBVHibzyZ';

// GHL onboarding booking calendar (public link).
export const ONBOARDING_CALENDAR_URL = 'https://api.leadconnectorhq.com/widget/booking/JqBPdsARvHo9H7xbnu0q';
