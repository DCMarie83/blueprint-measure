// Canned data for the /try JOBS board. The 9 real Kanban columns (from the
// P6 migration) in order, and job cards matching the real .card shape:
// name + address + meta (blueprint count · updated). The real card shows
// NEITHER client name NOR dollar value, so this mirrors that.

// Card top-accent palette, keyed by column position (mirrors DOT_COLORS).
export const DOT_COLORS = ['var(--color-primary)', '#10b981', '#60a5fa', '#a78bfa', '#f59e0b', '#ec4899']
export const accentFor = (pos) => DOT_COLORS[(pos - 1) % DOT_COLORS.length]

export const COLUMNS = [
  { id: 'c1', name: 'Measurements & Estimates', pos: 1 },
  { id: 'c2', name: 'Job Costing', pos: 2 },
  { id: 'c3', name: 'Review', pos: 3 },
  { id: 'c4', name: 'Sent to Client', pos: 4 },
  { id: 'c5', name: 'Accepted', pos: 5 },
  { id: 'c6', name: 'Deposit Received', pos: 6 },
  { id: 'c7', name: 'Scheduled', pos: 7 },
  { id: 'c8', name: 'In Progress', pos: 8 },
  { id: 'c9', name: 'Complete', pos: 9 },
]

// Static cards per column (the Oakwood card is injected dynamically by the flow
// so it can move Review → Sent to Client on tap).
export const STATIC_JOBS = {
  c1: [{ id: 'j-riverside', name: 'Riverside Lofts Common Areas', address: '820 Riverside Dr, Austin, TX', blueprints: 2, updated: 'Updated 1d ago' }],
  c2: [{ id: 'j-clubhouse', name: 'Cedar Park Clubhouse', address: '15 Club Dr, Cedar Park, TX', blueprints: 1, updated: 'Updated 3d ago' }],
  c3: [{ id: 'j-harbor', name: 'Harbor Point Lobby', address: '400 Harbor Pt, Round Rock, TX', blueprints: 2, updated: 'Updated 6h ago' }],
  c4: [{ id: 'j-maple', name: 'Maple Street Repaint', address: '112 Maple St, Austin, TX', blueprints: 1, updated: 'Updated 4d ago' }],
  c5: [{ id: 'j-suite200', name: 'Suite 200 Repaint', address: '200 Cedar Park Blvd', blueprints: 1, updated: 'Updated 1w ago' }],
  c6: [],
  c7: [{ id: 'j-northgate', name: 'Northgate Entry Repaint', address: '55 Northgate Mall', blueprints: 1, updated: 'Updated 5d ago' }],
  c8: [{ id: 'j-stairwell', name: 'Stairwell Coating', address: '900 Beltline Rd', blueprints: 1, updated: 'Updated 2d ago' }],
  c9: [{ id: 'j-reception', name: 'Reception Refinish', address: '12 Cedar Ct', blueprints: 2, updated: 'Updated 3w ago' }],
}

// The tappable job — Oakwood Office Repaint for Beltline Property Group, the
// SAME job the estimate reveal shows.
export const OAKWOOD_JOB = {
  id: 'j-oakwood',
  name: 'Oakwood Office Repaint',
  address: '1200 Oakwood Blvd, Austin, TX',
  blueprints: 3,
  updated: 'Updated 2h ago',
  client: 'Beltline Property Group',
}
