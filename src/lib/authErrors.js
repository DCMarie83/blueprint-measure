export function formatAuthError(error) {
  const msg = error?.message || String(error) || ''
  if (msg.toLowerCase().includes('banned')) {
    return 'Your account has been deactivated. Please contact support@blueprintmeasure.com if you believe this is in error.'
  }
  return msg
}
