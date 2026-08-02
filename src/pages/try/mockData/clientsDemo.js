// Canned data for the /try CLIENTS peek. Mirrors ClientListView columns:
// Name (avatar+business) / Status / Location / Last contact / Lifetime value /
// Projects / actions. Status vocab = lead/active/past/do_not_contact.

export const CLIENT_STATUS_META = {
  lead: { label: 'Lead', bg: 'rgba(242,114,67,0.14)', fg: '#F27243' },
  active: { label: 'Active', bg: 'rgba(38,70,76,0.12)', fg: '#26464C' },
  past: { label: 'Past', bg: 'var(--color-surface-2)', fg: 'var(--color-text-muted)' },
  do_not_contact: { label: 'Do not contact', bg: 'var(--color-surface-2)', fg: 'var(--color-text-muted)' },
}

export const CLIENTS_DEMO = [
  { id: 1, name: 'Summit Builders', business: 'Summit Builders LLC', status: 'active', location: 'Austin, TX', lastContact: '2 days ago', ltv: 48200, projects: 3, phone: true, email: true },
  { id: 2, name: 'Beltline Property Group', business: 'Beltline Property Group', status: 'active', location: 'Austin, TX', lastContact: '5 days ago', ltv: 32600, projects: 2, phone: true, email: true },
  { id: 3, name: 'Harbor Point LLC', business: 'Harbor Point LLC', status: 'lead', location: 'Round Rock, TX', lastContact: '1 week ago', ltv: 0, projects: 0, phone: true, email: true },
  { id: 4, name: 'Cedar & Co.', business: 'Cedar & Co. Interiors', status: 'active', location: 'Cedar Park, TX', lastContact: '3 weeks ago', ltv: 21400, projects: 1, phone: false, email: true },
  { id: 5, name: 'Northgate Retail', business: 'Northgate Retail Group', status: 'past', location: 'Austin, TX', lastContact: '2 months ago', ltv: 15800, projects: 0, phone: true, email: true },
  { id: 6, name: 'Lakeway Residences', business: '', status: 'lead', location: 'Lakeway, TX', lastContact: 'Never', ltv: 0, projects: 0, phone: false, email: true },
]

// Chip counts (All + per real status vocab).
export const CLIENT_CHIPS = [
  { key: 'all', label: 'All', count: 6, active: true },
  { key: 'lead', label: 'Lead', count: 2 },
  { key: 'active', label: 'Active', count: 3 },
  { key: 'past', label: 'Past', count: 1 },
  { key: 'do_not_contact', label: 'Do not contact', count: 0 },
]
