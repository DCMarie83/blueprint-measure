// src/constants/trades.js
// Single source of truth for trade verticals across RivetDog.
// Mirrors the companies.trade_vertical CHECK constraint in prod.
// If you add/remove a trade here, widen the DB CHECK in a new migration to match.

export const TRADES = [
  { value: 'painting',    label: 'Painting' },
  { value: 'flooring',    label: 'Flooring' },
  { value: 'carpentry',   label: 'Carpentry' },
  { value: 'roofing',     label: 'Roofing' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'electrical',  label: 'Electrical' },
]

export const DEFAULT_TRADE = 'painting'

export const TRADE_VALUES = TRADES.map(t => t.value)
