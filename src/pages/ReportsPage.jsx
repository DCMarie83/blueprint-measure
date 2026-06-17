import { useState, useEffect } from 'react'
import { BarChart3, Printer } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { getPayReport } from '../data/timeTracking'
import styles from './ReportsPage.module.css'

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function ReportsPage() {
  const { userProfile, company, isSuperAdmin } = useAuth()
  const companyId = userProfile?.company_id || company?.id
  const isAdmin = isSuperAdmin || userProfile?.role === 'contractor_admin'

  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId || !isAdmin) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const data = await getPayReport(companyId, { from, to })
        if (!cancelled) setRows(data)
      } catch (err) {
        console.error('Pay report:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [companyId, isAdmin, from, to])

  const totalHours = rows.reduce((s, r) => s + r.hours, 0)
  const totalPay = rows.reduce((s, r) => s + r.pay, 0)

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}>
          <div className={styles.placeholder}>
            <BarChart3 size={48} style={{ color: 'var(--color-primary)', marginBottom: 16 }} />
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Reports</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 15 }}>Job profitability, team performance, and revenue analytics — coming soon.</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.screenHeader}>
          <h1 className={styles.title}><BarChart3 size={24} /> Reports</h1>
        </div>

        {/* Controls (hidden in print) */}
        <div className={styles.controls}>
          <div className={styles.dateRow}>
            <label className={styles.dateLabel}>
              From
              <input type="date" className={styles.dateInput} value={from} onChange={e => setFrom(e.target.value)} />
            </label>
            <label className={styles.dateLabel}>
              To
              <input type="date" className={styles.dateInput} value={to} onChange={e => setTo(e.target.value)} />
            </label>
          </div>
          <button className={styles.printBtn} onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>
        </div>

        {/* Print-only header */}
        <div className={styles.printHeader}>
          <h1 className={styles.printCompany}>{company?.name || 'Company'}</h1>
          <h2 className={styles.printTitle}>Pay Report</h2>
          <p className={styles.printRange}>{from} to {to}</p>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>No time entries in this period.</div>
        ) : (
          <div className={styles.tableWrap}>
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
                        <span style={{ color: 'var(--color-text-muted)' }}>$0.00 <small style={{ fontStyle: 'italic' }}>no rate set</small></span>
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
        )}

        <p className={styles.generatedLine}>Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </main>
    </div>
  )
}
