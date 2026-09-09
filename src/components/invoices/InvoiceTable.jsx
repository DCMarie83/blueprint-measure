import { useTranslation } from 'react-i18next'
import InvoiceStatusBadge from './InvoiceStatusBadge'
import { ScrollbarInside } from '../common/FloatingScrollbar'
import { isOverdue } from '../../hooks/useInvoices'
import { INVOICE_COLUMNS, paidOf, balanceOf } from './invoiceListShared'
import styles from './InvoiceTable.module.css'

// The one sortable invoice table, mounted by the Pro invoice list and the
// Lite invoice list. Sorting is owned by the page (useInvoiceSort) so exports
// can take exactly the on-screen rows. Paid and Balance are ledger-derived
// via the page's one-query paidMap; Balance shows red when the invoice is
// past due.

function fmtMoney(val) {
  if (val == null) return ''
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function InvoiceTable({ rows, paidMap, clientNameOf, sortCol, sortAsc, onSort, onRowClick, renderStatusExtra }) {
  const { t } = useTranslation()

  return (
    <div className={styles.tableWrap}><ScrollbarInside />
      <table className={styles.table}>
        <thead>
          <tr>
            {INVOICE_COLUMNS.map(col => (
              <th
                key={col.key}
                className={styles.th}
                style={{ textAlign: col.align }}
                onClick={() => onSort(col.key)}
              >
                {t(col.labelKey)}{sortCol === col.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(inv => {
            const paid = paidOf(inv, paidMap)
            const balance = balanceOf(inv, paidMap)
            const overdue = isOverdue(inv)
            return (
              <tr key={inv.id} className={styles.tr} onClick={() => onRowClick(inv)}>
                <td className={`${styles.td} ${styles.number}`}>{inv.invoice_number}</td>
                <td className={styles.td}>{clientNameOf(inv) || ''}</td>
                <td className={`${styles.td} ${styles.muted}`}>{inv.projects?.name || ''}</td>
                <td className={styles.td}>{fmtDate(inv.created_at)}</td>
                <td className={styles.td}>{fmtDate(inv.due_date)}</td>
                <td className={`${styles.td} ${styles.money}`}>{fmtMoney(inv.total)}</td>
                <td className={`${styles.td} ${styles.money}`}>{fmtMoney(paid)}</td>
                <td className={`${styles.td} ${styles.money} ${overdue && balance > 0 ? styles.balanceOverdue : ''}`}>
                  {balance == null ? '' : fmtMoney(balance)}
                </td>
                <td className={styles.td}>
                  <InvoiceStatusBadge status={inv.status} isOverdue={overdue} />
                  {renderStatusExtra?.(inv)}
                </td>
                <td className={`${styles.td} ${styles.muted}`}>{fmtDate(inv.last_reminded_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
