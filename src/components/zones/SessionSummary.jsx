import { formatSF, formatLF } from '../../utils/fractions'
import styles from './SessionSummary.module.css'

const TYPE_COLORS = {
  SF: '#2e8bff',
  LF: '#22c55e',
  count: '#f59e0b',
}

// Shows running totals of saved zones grouped by measurement type.
// Only renders cards for types that have at least one zone.
// Totals update automatically because zones is live state from the parent.
export default function SessionSummary({ zones }) {
  const sfZones    = zones.filter(z => z.measurement_type === 'SF')
  const lfZones    = zones.filter(z => z.measurement_type === 'LF')
  const countZones = zones.filter(z => z.measurement_type === 'count')

  const totalSF    = sfZones.reduce((sum, z) => sum + (z.result ?? 0), 0)
  const totalLF    = lfZones.reduce((sum, z) => sum + (z.result ?? 0), 0)
  const totalCount = countZones.reduce((sum, z) => sum + (z.result ?? 0), 0)

  // SF: keep as decimal — "245.50" with "sq ft" label fits the narrow card.
  // LF: feet-inches format — "12' 6½"" with "linear" label.
  // count: whole number with "items" label.
  const cards = [
    sfZones.length    > 0 && { label: 'sq ft',  value: String(parseFloat(totalSF.toFixed(2))), color: TYPE_COLORS.SF },
    lfZones.length    > 0 && { label: 'linear',  value: formatLF(totalLF),            color: TYPE_COLORS.LF    },
    countZones.length > 0 && { label: 'items',   value: String(Math.round(totalCount)), color: TYPE_COLORS.count },
  ].filter(Boolean)

  if (cards.length === 0) return null

  return (
    <div className={styles.grid}>
      {cards.map(card => (
        <div
          key={card.label}
          className={styles.card}
          style={{ borderColor: card.color + '55', background: card.color + '0f' }}
        >
          <span className={styles.value} style={{ color: card.color }}>{card.value}</span>
          <span className={styles.label}>{card.label}</span>
        </div>
      ))}
    </div>
  )
}
