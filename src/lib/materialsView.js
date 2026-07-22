// Presentation helpers shared by the materials v2 flow (start / quick / swiper / table).
import { materialBuyQuantity } from '../utils/measurements'

export const GRADES = [
  { key: 'premium', label: 'Premium' },
  { key: 'standard', label: 'Standard' },
  { key: 'commercial', label: 'Commercial' },
]

// Flat, exact money.
export function money(n) {
  return '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Cost of one line at a grade: buy quantity (coats + overage + 0.25 gallon
// rounding) x the grade's unit cost. Matches the table math exactly.
export function lineCostAtGrade(line, grade) {
  const cost = Number(line[`cost_${grade}`])
  if (!cost || cost < 0) return 0
  return materialBuyQuantity(line) * cost
}

export function gradeTotal(lines, grade) {
  return (lines || []).reduce((sum, l) => sum + lineCostAtGrade(l, grade), 0)
}

export { materialBuyQuantity }
