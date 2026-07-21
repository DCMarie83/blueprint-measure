// Shared presentation helpers for the Clients v2 surface (list + detail).
// Pure functions only.

export const CLIENT_STATUSES = ['lead', 'active', 'past', 'do_not_contact']

// Status chip colors per brand spec.
export const STATUS_META = {
  lead:           { label: 'Lead',           bg: 'rgba(242,114,67,0.14)', fg: '#F27243' },
  active:         { label: 'Active',         bg: 'rgba(38,70,76,0.12)',   fg: '#26464C' },
  past:           { label: 'Past',           bg: 'var(--color-surface-2, #eef0f0)', fg: 'var(--color-text-muted, #6b7280)' },
  do_not_contact: { label: 'Do not contact', bg: 'var(--color-surface-2, #eef0f0)', fg: 'var(--color-text-muted, #6b7280)' },
}

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.active
}

export function initials(name) {
  return (name || '??').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

// Flat, exact money. "$0" for null/zero, whole dollars otherwise.
export function fmtMoneyFlat(v) {
  const n = Number(v)
  if (!n || n <= 0) return '$0'
  return '$' + Math.round(n).toLocaleString('en-US')
}

export const AVATAR_GRADIENT = 'linear-gradient(135deg, #26464C, #1B2426)'

// Best "City, ST" for a client: primary client_addresses row, else legacy jsonb.
export function clientLocation(client) {
  const addrs = client?.client_addresses_resolved
  if (addrs && (addrs.city || addrs.state)) return [addrs.city, addrs.state].filter(Boolean).join(', ')
  const legacy = client?.property_address || client?.address
  if (legacy && (legacy.city || legacy.state)) return [legacy.city, legacy.state].filter(Boolean).join(', ')
  return null
}

// The most specific real detail route for an activity row, from its metadata.
// Routes that exist: /invoices/:id, /estimates/:id, /project/:projectId.
export function activityLink(item) {
  const m = item?.metadata
  if (!m) return null
  if (m.invoice_id) return `/invoices/${m.invoice_id}`
  if (m.estimate_id) return `/estimates/${m.estimate_id}`
  if (m.project_id) return `/project/${m.project_id}`
  return null
}
