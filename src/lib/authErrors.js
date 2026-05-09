import { SUPPORT } from './config'

export function formatAuthError(error) {
  const msg = error?.message || String(error) || ''
  if (msg.toLowerCase().includes('banned')) {
    return `Your account has been deactivated. Please contact ${SUPPORT.email} if you believe this is in error.`
  }
  return msg
}
