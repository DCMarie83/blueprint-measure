// One builder for every email link in the app (G81). The per-user
// "Open email links in" preference (user_profiles.email_client) picks the
// target: the system mail handler, Gmail on the web, or Outlook on the web.
export function buildEmailLink(prefs, to, subject = '') {
  const client = prefs?.email_client || 'system'
  const encTo = encodeURIComponent(to || '')
  const encSubject = encodeURIComponent(subject || '')
  if (client === 'gmail') {
    return `https://mail.google.com/mail/?view=cm&to=${encTo}${subject ? `&su=${encSubject}` : ''}`
  }
  if (client === 'outlook') {
    return `https://outlook.office.com/mail/deeplink/compose?to=${encTo}${subject ? `&subject=${encSubject}` : ''}`
  }
  return `mailto:${to || ''}${subject ? `?subject=${encSubject}` : ''}`
}

// Web clients open in a new tab; mailto stays in-page for the OS handler.
export function emailLinkTarget(prefs) {
  const client = prefs?.email_client || 'system'
  return client === 'system' ? undefined : '_blank'
}
