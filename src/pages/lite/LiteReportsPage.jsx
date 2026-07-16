import { useState, useEffect, useMemo } from 'react'
import { Download } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { supabase } from '../../lib/supabase'
import { GC_CLIENT_TYPE, fmtMoney } from '../../lib/lite'
import { generateLiteReportXLSX } from '../../lib/generateLiteReportXLSX'
import styles from './lite.module.css'

// The Lite Reports surface — the bookkeeper handoff. Three read-only money
// sections (Payments Received, Invoices Issued, Unbilled Work) over a chosen
// date window, plus a multi-sheet Excel export. This is a pure money surface:
// no dog puns anywhere, including the empty states. Every figure is summed
// client-side (there is no DB total trigger), matching the /home precedent.

const STATUS_LABELS = {
  draft: 'Draft', sent: 'Sent', viewed: 'Viewed',
  partial: 'Partial', paid: 'Paid', void: 'Void',
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Browser-local window boundaries, matching useLiteHomeStats exactly.
function presetRange(key, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (key) {
    case 'this_month':
      return { label: 'This month', from: localDateStr(new Date(y, m, 1)), to: localDateStr(new Date(y, m + 1, 0)) }
    case 'last_month':
      return { label: 'Last month', from: localDateStr(new Date(y, m - 1, 1)), to: localDateStr(new Date(y, m, 0)) }
    case 'this_year':
      return { label: 'This year', from: localDateStr(new Date(y, 0, 1)), to: localDateStr(new Date(y, 11, 31)) }
    case 'last_year':
      return { label: 'Last year', from: localDateStr(new Date(y - 1, 0, 1)), to: localDateStr(new Date(y - 1, 11, 31)) }
    default:
      return { label: 'This month', from: localDateStr(new Date(y, m, 1)), to: localDateStr(new Date(y, m + 1, 0)) }
  }
}

const PRESETS = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'this_year', label: 'This year' },
  { key: 'last_year', label: 'Last year' },
  { key: 'custom', label: 'Custom' },
]

const day = d => String(d || '').slice(0, 10)

export default function LiteReportsPage() {
  const { companyId, company } = useEffectiveCompany()
  const [preset, setPreset] = useState('this_month')
  const [customFrom, setCustomFrom] = useState(() => presetRange('this_month').from)
  const [customTo, setCustomTo] = useState(() => presetRange('this_month').to)
  const [raw, setRaw] = useState(null) // { invoices, payments, entries, gcNameById, projById, invoiceById }
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const range = useMemo(() => {
    if (preset === 'custom') return { label: 'Custom', from: customFrom, to: customTo }
    return presetRange(preset)
  }, [preset, customFrom, customTo])

  // One batched company-scoped read of the full dataset; the window is applied
  // client-side so switching presets never re-hits the network.
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [invRes, payRes, entRes, cliRes, projRes] = await Promise.all([
        supabase.from('invoices')
          .select('id, invoice_number, status, total, paid_amount, created_at, client_id')
          .eq('company_id', companyId),
        supabase.from('invoice_payments')
          .select('id, invoice_id, amount, payment_method, payment_date')
          .eq('company_id', companyId),
        supabase.from('work_entries')
          .select('id, project_id, work_date, entry_type, unit, quantity, hours, rate_snapshot, amount, description, invoice_id, work_items(name)')
          .eq('company_id', companyId),
        supabase.from('clients')
          .select('id, display_name, business_name, client_type')
          .eq('company_id', companyId),
        supabase.from('projects')
          .select('id, name, client_id')
          .eq('company_id', companyId)
          .is('deleted_at', null),
      ])
      if (cancelled) return
      if (invRes.error || payRes.error || entRes.error || cliRes.error || projRes.error) {
        setRaw(null); setLoading(false); return
      }
      const gcNameById = {}
      for (const c of cliRes.data ?? []) {
        if (c.client_type === GC_CLIENT_TYPE) gcNameById[c.id] = c.business_name || c.display_name
      }
      const projById = {}
      for (const p of projRes.data ?? []) projById[p.id] = p
      const invoiceById = {}
      for (const inv of invRes.data ?? []) invoiceById[inv.id] = inv
      setRaw({
        invoices: invRes.data ?? [],
        payments: payRes.data ?? [],
        entries: entRes.data ?? [],
        gcNameById, projById, invoiceById,
      })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyId])

  // Derive the three sections + the full work log for the current window.
  const report = useMemo(() => {
    if (!raw) return null
    const { from, to } = range
    const { invoices, payments, entries, gcNameById, projById, invoiceById } = raw
    const inWindow = d => { const x = day(d); return x && x >= from && x <= to }

    // Section 1 — Payments received (per-payment rows: the mark-paid source).
    const paymentRows = payments
      .filter(p => inWindow(p.payment_date))
      .map(p => {
        const inv = invoiceById[p.invoice_id]
        return {
          date: day(p.payment_date),
          invoiceNumber: inv?.invoice_number || '—',
          gcName: inv ? (gcNameById[inv.client_id] || 'No GC') : 'No GC',
          method: p.payment_method || '—',
          amount: Number(p.amount) || 0,
        }
      })
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const paymentsTotal = paymentRows.reduce((s, r) => s + r.amount, 0)

    // Section 2 — Invoices issued (created in window).
    const invoiceRows = invoices
      .filter(inv => inWindow(inv.created_at))
      .map(inv => {
        const total = Number(inv.total) || 0
        const collected = Number(inv.paid_amount) || 0
        return {
          invoiceNumber: inv.invoice_number,
          gcName: gcNameById[inv.client_id] || 'No GC',
          issuedDate: inv.created_at,
          total,
          collected,
          balance: Math.max(0, total - collected),
          status: inv.status,
        }
      })
      .sort((a, b) => (day(a.issuedDate) < day(b.issuedDate) ? -1 : 1))
    const invoicedTotal = invoiceRows.reduce((s, r) => s + r.total, 0)
    const collectedTotal = invoiceRows.reduce((s, r) => s + r.collected, 0)
    const outstandingTotal = invoiceRows.reduce((s, r) => s + r.balance, 0)

    // Section 3 — Unbilled work (in window, no invoice), grouped by job.
    const unbilledByJob = {}
    for (const e of entries) {
      if (e.invoice_id || !inWindow(e.work_date)) continue
      const proj = projById[e.project_id]
      const key = e.project_id
      const g = unbilledByJob[key] || (unbilledByJob[key] = {
        jobName: proj?.name || 'Unknown job',
        gcName: proj ? (gcNameById[proj.client_id] || 'No GC') : 'No GC',
        count: 0, total: 0,
      })
      g.count += 1
      g.total += Number(e.amount) || 0
    }
    const unbilledRows = Object.values(unbilledByJob).sort((a, b) => b.total - a.total)
    const unbilledTotal = unbilledRows.reduce((s, r) => s + r.total, 0)
    const unbilledCount = unbilledRows.reduce((s, r) => s + r.count, 0)

    // Full work log — every entry in window, billed or not (Excel Work Log tab).
    const workLog = entries
      .filter(e => inWindow(e.work_date))
      .map(e => {
        const proj = projById[e.project_id]
        const inv = e.invoice_id ? invoiceById[e.invoice_id] : null
        return {
          workDate: e.work_date,
          jobName: proj?.name || 'Unknown job',
          gcName: proj ? (gcNameById[proj.client_id] || 'No GC') : 'No GC',
          item: e.work_items?.name || e.description || '',
          unit: e.unit,
          qtyOrHours: e.entry_type === 'hourly' ? (Number(e.hours) || 0) : (Number(e.quantity) || 0),
          rate: Number(e.rate_snapshot) || 0,
          amount: Number(e.amount) || 0,
          invoiceRef: inv?.invoice_number || 'unbilled',
        }
      })
      .sort((a, b) => (day(a.workDate) < day(b.workDate) ? -1 : 1))

    return {
      paymentRows, paymentsTotal,
      invoiceRows, invoicedTotal, collectedTotal, outstandingTotal,
      unbilledRows, unbilledTotal, unbilledCount,
      workLog,
    }
  }, [raw, range])

  async function handleExport() {
    if (!report) return
    setExporting(true)
    try {
      await generateLiteReportXLSX({
        company: { name: company?.name, logo_url: company?.logo_url },
        period: range,
        summary: {
          paymentsTotal: report.paymentsTotal,
          invoicedTotal: report.invoicedTotal,
          collectedTotal: report.collectedTotal,
          outstandingTotal: report.outstandingTotal,
          unbilledTotal: report.unbilledTotal,
        },
        payments: report.paymentRows,
        invoices: report.invoiceRows,
        workLog: report.workLog,
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Reports</h1>
            <p className={styles.subtitle}>Your books for any window — ready to hand off.</p>
          </div>
          <button className={styles.primaryBtn} onClick={handleExport} disabled={loading || exporting || !report}>
            <Download size={16} /> {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>

        {/* Range picker */}
        <div className={styles.segmentChips}>
          {PRESETS.map(p => (
            <button
              key={p.key}
              className={`${styles.chip} ${preset === p.key ? styles.chipActive : ''}`}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className={styles.fieldRow} style={{ marginBottom: 12 }}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>From</label>
              <input type="date" className={styles.input} value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>To</label>
              <input type="date" className={styles.input} value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}

        {loading || !report ? (
          <div className={styles.loading}>Loading…</div>
        ) : (
          <>
            {/* Section 1 — Payments Received */}
            <div className={styles.card}>
              <div className={styles.rowBetween}>
                <h2 className={styles.title} style={{ fontSize: 18 }}>Payments received</h2>
                <div className={styles.statValue} style={{ fontSize: 20 }}>{fmtMoney(report.paymentsTotal)}</div>
              </div>
              {report.paymentRows.length === 0 ? (
                <p className={styles.muted} style={{ marginTop: 8 }}>No payments recorded in this period.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr><th>Date</th><th>Invoice</th><th>GC</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
                    </thead>
                    <tbody>
                      {report.paymentRows.map((r, i) => (
                        <tr key={i}>
                          <td>{new Date(r.date).toLocaleDateString()}</td>
                          <td>{r.invoiceNumber}</td>
                          <td>{r.gcName}</td>
                          <td>{r.method}</td>
                          <td style={{ textAlign: 'right' }}>{fmtMoney(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section 2 — Invoices Issued */}
            <div className={styles.card}>
              <div className={styles.rowBetween}>
                <h2 className={styles.title} style={{ fontSize: 18 }}>Invoices issued</h2>
                <div className={styles.statValue} style={{ fontSize: 20 }}>{fmtMoney(report.invoicedTotal)}</div>
              </div>
              {report.invoiceRows.length === 0 ? (
                <p className={styles.muted} style={{ marginTop: 8 }}>No invoices issued in this period.</p>
              ) : (
                <>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Invoice</th><th>GC</th><th>Issued</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th><th style={{ textAlign: 'right' }}>Balance</th></tr>
                      </thead>
                      <tbody>
                        {report.invoiceRows.map((r, i) => (
                          <tr key={i}>
                            <td>{r.invoiceNumber}</td>
                            <td>{r.gcName}</td>
                            <td>{new Date(r.issuedDate).toLocaleDateString()}</td>
                            <td style={{ textAlign: 'right' }}>{fmtMoney(r.total)}</td>
                            <td>{STATUS_LABELS[r.status] || r.status}</td>
                            <td style={{ textAlign: 'right' }}>{fmtMoney(r.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className={styles.rowBetween} style={{ marginTop: 10 }}>
                    <span className={styles.muted}>Issued {fmtMoney(report.invoicedTotal)}</span>
                    <span className={styles.muted}>Collected {fmtMoney(report.collectedTotal)}</span>
                    <span className={styles.muted}>Outstanding {fmtMoney(report.outstandingTotal)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Section 3 — Unbilled Work */}
            <div className={styles.card}>
              <div className={styles.rowBetween}>
                <h2 className={styles.title} style={{ fontSize: 18 }}>Unbilled work</h2>
                <div className={styles.statValue} style={{ fontSize: 20 }}>{fmtMoney(report.unbilledTotal)}</div>
              </div>
              {report.unbilledRows.length === 0 ? (
                <p className={styles.muted} style={{ marginTop: 8 }}>No unbilled work in this period.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr><th>Job</th><th>GC</th><th style={{ textAlign: 'right' }}>Entries</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
                    </thead>
                    <tbody>
                      {report.unbilledRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.jobName}</td>
                          <td>{r.gcName}</td>
                          <td style={{ textAlign: 'right' }}>{r.count}</td>
                          <td style={{ textAlign: 'right' }}>{fmtMoney(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
