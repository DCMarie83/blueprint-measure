import { Trash2 } from 'lucide-react'
import styles from './LineItemsTable.module.css'

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function LineItemsTable({ lineItems, onUpdate, onRemove, readOnly }) {
  if (lineItems.length === 0) {
    return (
      <div className={styles.empty}>
        No line items yet. Add zones or pricing items to build your estimate.
      </div>
    )
  }

  // Group by category_name
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
            <th className={styles.thRate}>Good Rate</th>
            <th className={styles.thRate}>Better Rate</th>
            <th className={styles.thRate}>Best Rate</th>
            <th className={styles.thTotal}>Good Total</th>
            <th className={styles.thTotal}>Better Total</th>
            <th className={styles.thTotal}>Best Total</th>
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
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ category, items, onUpdate, onRemove, readOnly }) {
  const colSpan = readOnly ? 9 : 10
  return (
    <>
      <tr className={styles.catRow}>
        <td colSpan={colSpan} className={styles.catCell}>{category}</td>
      </tr>
      {items.map(li => (
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
          </td>
          <td className={styles.tdUnit}>
            {readOnly ? (
              <span className={styles.unitLabel}>{UNIT_LABELS[li.unit] || li.unit}</span>
            ) : (
              <select
                className={styles.cellInput}
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
              <span className={styles.mono}>{Number(li.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
                className={`${styles.cellInput} ${styles.cellNumber}`}
                type="number"
                step="0.01"
                min="0"
                value={li.rate_good === 0 || li.rate_good == null ? '' : li.rate_good}
                placeholder="0"
                onChange={e => onUpdate(li.id, { rate_good: e.target.value === '' ? 0 : Number(e.target.value) })}
                onFocus={e => e.target.select()}
              />
            )}
          </td>
          <td className={styles.tdRate}>
            {readOnly ? (
              <span className={styles.mono}>{fmtMoney(li.rate_better)}</span>
            ) : (
              <input
                className={`${styles.cellInput} ${styles.cellNumber}`}
                type="number"
                step="0.01"
                min="0"
                value={li.rate_better === 0 || li.rate_better == null ? '' : li.rate_better}
                placeholder="0"
                onChange={e => onUpdate(li.id, { rate_better: e.target.value === '' ? 0 : Number(e.target.value) })}
                onFocus={e => e.target.select()}
              />
            )}
          </td>
          <td className={styles.tdRate}>
            {readOnly ? (
              <span className={styles.mono}>{fmtMoney(li.rate_best)}</span>
            ) : (
              <input
                className={`${styles.cellInput} ${styles.cellNumber}`}
                type="number"
                step="0.01"
                min="0"
                value={li.rate_best === 0 || li.rate_best == null ? '' : li.rate_best}
                placeholder="0"
                onChange={e => onUpdate(li.id, { rate_best: e.target.value === '' ? 0 : Number(e.target.value) })}
                onFocus={e => e.target.select()}
              />
            )}
          </td>
          <td className={styles.tdTotal}>
            <span className={styles.mono}>{fmtMoney(li.total_good)}</span>
          </td>
          <td className={styles.tdTotal}>
            <span className={styles.mono}>{fmtMoney(li.total_better)}</span>
          </td>
          <td className={styles.tdTotal}>
            <span className={styles.mono}>{fmtMoney(li.total_best)}</span>
          </td>
          {!readOnly && (
            <td className={styles.tdAction}>
              <button
                className={styles.removeBtn}
                onClick={() => onRemove(li.id)}
                title="Remove line item"
              >
                <Trash2 size={14} />
              </button>
            </td>
          )}
        </tr>
      ))}
    </>
  )
}
