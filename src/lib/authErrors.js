import { SUPPORT } from './config'

export function formatAuthError(error) {
  const msg = error?.message || String(error) || ''
  const lower = msg.toLowerCase()
  if (lower.includes('banned')) {
    return `Your account has been deactivated. Please contact ${SUPPORT.email} if you believe this is in error.`
  }
  // Leaked/weak password rejection from Supabase Auth. The exact prod string
  // is unknown, so match defensively on substrings.
  if (['weak', 'known', 'pwned', 'compromised', 'breach'].some(w => lower.includes(w))) {
    return 'That password has appeared in a known data breach. Please choose a different one.'
  }
  return msg
}
