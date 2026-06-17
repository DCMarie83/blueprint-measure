import styles from './PayTable.module.css'

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function PayTable({ rows, className }) {
  const totalHours = rows.reduce((s, r) => s + r.hours, 0)
  const totalPay = rows.reduce((s, r) => s + r.pay, 0)

  if (rows.length === 0) return null

  return (
    <div className={`${styles.wrap} ${className || ''}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Worker</th>
            <th className={styles.th} style={{ textAlign: 'right' }}>Hours</th>
            <th className={styles.th} style={{ textAlign: 'right' }}>Rate ($/hr)</th>
            <th className={styles.th} style={{ textAlign: 'right' }}>Pay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.crewMemberId} className={styles.tr}>
              <td className={styles.td}>{r.name}</td>
              <td className={styles.td} style={{ textAlign: 'right' }}>{r.hours.toFixed(2)}</td>
              <td className={styles.td} style={{ textAlign: 'right' }}>
                {r.rate > 0 ? fmtUSD.format(r.rate) : (
                  <span className={styles.noRate}>$0.00 <small>no rate set</small></span>
                )}
              </td>
              <td className={styles.td} style={{ textAlign: 'right', fontWeight: 600 }}>{fmtUSD.format(r.pay)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.totalsRow}>
            <td className={styles.td} style={{ fontWeight: 700 }}>Total</td>
            <td className={styles.td} style={{ textAlign: 'right', fontWeight: 700 }}>{totalHours.toFixed(2)}</td>
            <td className={styles.td}></td>
            <td className={styles.td} style={{ textAlign: 'right', fontWeight: 700 }}>{fmtUSD.format(totalPay)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
