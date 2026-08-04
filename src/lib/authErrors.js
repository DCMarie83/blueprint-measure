import { SUPPORT } from './config'

// Non-component module: takes `t` (react-i18next) as an argument and returns a
// ready-to-display, localized string. Callers pass their component's `t`.
export function formatAuthError(error, t) {
  const msg = error?.message || String(error) || ''
  const lower = msg.toLowerCase()
  if (lower.includes('banned')) {
    return t('shared:authErrors.deactivated', { email: SUPPORT.email })
  }
  // Leaked/weak password rejection from Supabase Auth. The exact prod string
  // is unknown, so match defensively on substrings.
  if (['weak', 'known', 'pwned', 'compromised', 'breach'].some(w => lower.includes(w))) {
    return t('shared:authErrors.breachedPassword')
  }
  return msg
}
