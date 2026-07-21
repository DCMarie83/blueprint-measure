import { Trash2 } from 'lucide-react'
import MarketBand from '../smartbid/MarketBand'
import styles from './LineItemsTable.module.css'

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }

const PROVENANCE_LABEL = { library: 'Library', benchmark: 'Market', manual: 'Manual' }

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const chipStyle = (kind) => ({
  display: 'inline-block', marginLeft: 6, padding: '1px 7px', borderRadius: 9999,
  fontSize: 10, fontWeight: 700, verticalAlign: 'middle',
  background: kind === 'library' ? 'rgba(38,70,76,0.10)' : kind === 'benchmark' ? 'rgba(242,114,67,0.12)' : 'var(--color-surface-2)',
  color: kind === 'library' ? 'var(--color-primary, #26464c)' : kind === 'benchmark' ? 'var(--color-primary, #26464c)' : 'var(--color-text-muted)',
})

export default function LineItemsTable({ lineItems, onUpdate, onRemove, readOnly, smart = false, benchmarkMap, pulseIds }) {
  if (lineItems.length === 0) {
    return (
      <div className={styles.empty}>
        No line items yet. Add zones or pricing items to build your estimate.
      </div>
    )
  }

  const benchMap = benchmarkMap || new Map()

  const groups = []
  const catOrder = []
  const catMap = {}
  for (const li of lineItems) {
    const cat = li.category_name || 'Uncategorized'
    if (!catMap[cat]) {
      catMap[cat] = []
      catOrder.push(cat)
    }
    catMap[cat].push(li)
  }
  for (const cat of catOrder) {
    groups.push({ category: cat, items: catMap[cat] })
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thDesc}>Description</th>
            <th className={styles.thUnit}>Unit</th>
            <th className={styles.thQty}>Qty</th>
            <th className={styles.thRate}>Rate</th>
            <th className={styles.thTotal}>Total</th>
            {!readOnly && <th className={styles.thAction}></th>}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ category, items }) => (
            <GroupRows
              key={category}
              category={category}
              items={items}
              onUpdate={onUpdate}
              onRemove={onRemove}
              readOnly={readOnly}
              smart={smart}
              benchMap={benchMap}
              pulseIds={pulseIds}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ category, items, onUpdate, onRemove, readOnly, smart, benchMap, pulseIds }) {
  const pulses = pulseIds || new Set()
  const colSpan = readOnly ? 5 : 6
  return (
    <>
      <tr className={styles.catRow}>
        <td colSpan={colSpan} className={styles.catCell}>{category}</td>
      </tr>
      {items.map(li => {
        const isLump = li.unit === 'lump_sum'
        const kind = smart ? (li.priced_from || 'manual') : null
        const band = smart && li.benchmark_item_id ? benchMap.get(li.benchmark_item_id) : null
        const rateNum = Number(li.rate_good) || 0
        return (
          <tr key={li.id} className={styles.itemRow}>
            <td className={styles.tdDesc}>
              {readOnly ? (
                <span>{li.description}</span>
              ) : (
                <input
                  className={styles.cellInput}
                  value={li.description}
                  onChange={e => onUpdate(li.id, { description: e.target.value })}
                  placeholder="Description"
                />
              )}
              {li.source_zone_name && (
                <span className={styles.zoneBadge} title={`From zone: ${li.source_zone_name}`}>
                  {li.source_zone_name}
                </span>
              )}
              {smart && <span style={chipStyle(kind)}>{PROVENANCE_LABEL[kind] || 'Manual'}</span>}
            </td>
            <td className={styles.tdUnit}>
              {readOnly ? (
                <span className={styles.unitLabel}>{UNIT_LABELS[li.unit] || li.unit}</span>
              ) : (
                <select
                  className={styles.cellSelect}
                  value={li.unit || 'sf'}
                  onChange={e => onUpdate(li.id, { unit: e.target.value })}
                >
                  <option value="sf">SF</option>
                  <option value="lf">LF</option>
                  <option value="each">Each</option>
                  <option value="hour">Hour</option>
                  <option value="lump_sum">Lump Sum</option>
                </select>
              )}
            </td>
            <td className={styles.tdQty}>
              {readOnly ? (
                <span className={styles.mono}>{isLump ? '—' : Number(li.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              ) : isLump ? (
                <span className={styles.mutedDash}>—</span>
              ) : (
                <input
                  className={`${styles.cellInput} ${styles.cellNumber}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={li.quantity === 0 || li.quantity == null ? '' : li.quantity}
                  placeholder="0"
                  onChange={e => onUpdate(li.id, { quantity: e.target.value === '' ? 0 : Number(e.target.value) })}
                  onFocus={e => e.target.select()}
                />
              )}
            </td>
            <td className={styles.tdRate}>
              {readOnly ? (
                <span className={styles.mono}>{fmtMoney(li.rate_good)}</span>
              ) : (
                <input
                  className={`${styles.cellInput} ${styles.cellNumber} ${pulses.has(li.id) ? 'sb-pulse' : ''}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={li.rate_good === 0 || li.rate_good == null ? '' : li.rate_good}
                  placeholder={isLump ? 'Amount' : '0'}
                  onChange={e => onUpdate(li.id, { rate_good: e.target.value === '' ? 0 : Number(e.target.value) })}
                  onFocus={e => e.target.select()}
                />
              )}
              {band && (
                <MarketBand compact low={band.local_low} typical={band.local_typical} high={band.local_high} value={rateNum} />
              )}
            </td>
            <td className={styles.tdTotal}>
              <span className={styles.mono}>{fmtMoney(li.total_good)}</span>
            </td>
            {!readOnly && (
              <td className={styles.tdAction}>
                <button className={styles.removeBtn} onClick={() => onRemove(li.id)} title="Remove">
                  <Trash2 size={14} />
                </button>
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}
