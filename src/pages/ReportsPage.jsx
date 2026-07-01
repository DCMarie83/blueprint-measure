import { useState, useEffect } from 'react'
import { BarChart3, Printer } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { getPayReport, getPayStatementData } from '../data/timeTracking'
import { getJobCostingRows, getJobCostingDetail } from '../data/jobCosting'
import { generatePayStatementPDF } from '../lib/generatePayStatementPDF'
import { fmtMoney } from '../utils/formatMoney'
import PayTable from '../components/PayTable'
import styles from './ReportsPage.module.css'

function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function fmtPct(val) {
  if (val == null) return '—'
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
}

const CAT_LABELS = { material: 'Material', labor: 'Labor', subcontractor: 'Subcontractor', equipment: 'Equipment', permit: 'Permit', other: 'Other' }

export default function ReportsPage() {
  const { userProfile, company, isSuperAdmin } = useAuth()
  const companyId = userProfile?.company_id || company?.id
  const isAdmin = isSuperAdmin || userProfile?.role === 'contractor_admin'

  const [view, setView] = useState('pay') // 'pay' | 'costing'
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))

  // Pay report state
  const [payRows, setPayRows] = useState([])
  const [payLoading, setPayLoading] = useState(false)
  const [downloadingId, setDownloadingId] = useState(null)

  // Job costing state
  const [costingRows, setCostingRows] = useState([])
  const [costingLoading, setCostingLoading] = useState(false)
  const [sortCol, setSortCol] = useState('actualMargin')
  const [sortAsc, setSortAsc] = useState(true)
  const [detailProjectId, setDetailProjectId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Pay report fetch
  useEffect(() => {
    if (!companyId || !isAdmin || view !== 'pay') return
    let cancelled = false
    setPayLoading(true)
    ;(async () => {
      try {
        const data = await getPayReport(companyId, { from, to })
        if (!cancelled) setPayRows(data)
      } catch (err) { console.error('Pay report:', err) }
      finally { if (!cancelled) setPayLoading(false) }
    })()
    return () => { cancelled = true }
  }, [companyId, isAdmin, from, to, view])

  // Job costing fetch
  useEffect(() => {
    if (!companyId || !isAdmin || view !== 'costing') return
    let cancelled = false
    setCostingLoading(true)
    ;(async () => {
      try {
        const data = await getJobCostingRows(companyId, { from, to })
        if (!cancelled) setCostingRows(data)
      } catch (err) { console.error('Job costing:', err) }
      finally { if (!cancelled) setCostingLoading(false) }
    })()
    return () => { cancelled = true }
  }, [companyId, isAdmin, from, to, view])

  // Job detail fetch
  useEffect(() => {
    if (!companyId || !detailProjectId) return
    let cancelled = false
    setDetailLoading(true)
    ;(async () => {
      try {
        const data = await getJobCostingDetail(companyId, detailProjectId)
        if (!cancelled) setDetail(data)
      } catch (err) { console.error('Job detail:', err) }
      finally { if (!cancelled) setDetailLoading(false) }
    })()
    return () => { cancelled = true }
  }, [companyId, detailProjectId])

  async function handleDownloadStatement(crewMemberId) {
    setDownloadingId(crewMemberId)
    try {
      const { data: stmtData, error: stmtErr } = await getPayStatementData(companyId, crewMemberId, { from, to })
      if (stmtErr || !stmtData) { alert(stmtErr || 'Could not load pay data'); return }

      // Pre-fetch company logo
      let companyData = { name: company?.name, primary_color: company?.primary_color, address_line1: company?.address_line1, address_line2: company?.address_line2, city: company?.city, state: company?.state, zip: company?.zip, business_phone: company?.business_phone }
      if (company?.logo_url) {
        try {
          const res = await fetch(company.logo_url)
          if (res.ok) {
            const blob = await res.blob()
            const reader = new FileReader()
            const logoData = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob) })
            companyData.logo_data = logoData
          }
        } catch { /* skip logo */ }
      }

      const pdf = generatePayStatementPDF({ ...stmtData, company: companyData, returnAs: 'blob' })
      const url = URL.createObjectURL(pdf)
      const a = document.createElement('a')
      a.href = url
      a.download = `PayStatement_${stmtData.worker.name.replace(/\s+/g, '_')}_${from}_to_${to}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Pay statement download:', err)
      alert('Failed to generate pay statement')
    } finally {
      setDownloadingId(null)
    }
  }

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

        {/* View switcher */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 4, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--color-border)', width: 'fit-content' }}>
          <button onClick={() => { setView('pay'); setDetailProjectId(null) }} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: view === 'pay' ? 'var(--color-primary)' : 'var(--color-bg)', color: view === 'pay' ? '#fff' : 'var(--color-text-muted)' }}>Pay Report</button>
          <button onClick={() => { setView('costing'); setDetailProjectId(null) }} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: view === 'costing' ? 'var(--color-primary)' : 'var(--color-bg)', color: view === 'costing' ? '#fff' : 'var(--color-text-muted)' }}>Job Costing</button>
        </div>

        <div className={styles.controls}>
          <div className={styles.dateRow}>
            <label className={styles.dateLabel}>From<input type="date" className={styles.dateInput} value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label className={styles.dateLabel}>To<input type="date" className={styles.dateInput} value={to} onChange={e => setTo(e.target.value)} /></label>
          </div>
          <button className={styles.printBtn} onClick={() => window.print()}><Printer size={14} /> Print</button>
        </div>

        <div className={styles.printHeader}>
          <h1 className={styles.printCompany}>{company?.name || 'Company'}</h1>
          <h2 className={styles.printTitle}>{view === 'pay' ? 'Pay Report' : 'Job Costing Report'}</h2>
          <p className={styles.printRange}>{from} to {to}</p>
        </div>

        {/* PAY REPORT */}
        {view === 'pay' && (
          payLoading ? <div className={styles.empty}>Loading...</div>
          : payRows.length === 0 ? <div className={styles.empty}>No time entries in this period.</div>
          : <PayTable rows={payRows} onDownloadStatement={handleDownloadStatement} downloadingId={downloadingId} />
        )}

        {/* JOB COSTING */}
        {view === 'costing' && !detailProjectId && (
          <CostingPortfolio
            rows={costingRows}
            loading={costingLoading}
            sortCol={sortCol}
            sortAsc={sortAsc}
            onSort={(col) => { if (col === sortCol) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(col === 'project_name') } }}
            onSelectProject={setDetailProjectId}
          />
        )}

        {view === 'costing' && detailProjectId && (
          <CostingDetail
            detail={detail}
            loading={detailLoading}
            onBack={() => { setDetailProjectId(null); setDetail(null) }}
          />
        )}

        <p className={styles.generatedLine}>Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </main>
    </div>
  )
}

// ── Portfolio table ─────────────────────────────────────────────────────

function CostingPortfolio({ rows, loading, sortCol, sortAsc, onSort, onSelectProject }) {
  if (loading) return <div className={styles.empty}>Loading...</div>
  if (rows.length === 0) return <div className={styles.empty}>No jobs with financial activity in this period.</div>

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol]
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortAsc ? (av ?? 0) - (bv ?? 0) : (bv ?? 0) - (av ?? 0)
  })

  const totals = rows.reduce((t, r) => ({
    quoted: t.quoted + r.quoted,
    billed: t.billed + r.billed,
    collected: t.collected + r.collected,
    totalCost: t.totalCost + r.totalCost,
  }), { quoted: 0, billed: 0, collected: 0, totalCost: 0 })
  const blendedMarginPct = totals.collected > 0 ? ((totals.collected - totals.totalCost) / totals.collected) * 100 : null

  const cols = [
    { key: 'project_name', label: 'Job' },
    { key: 'quoted', label: 'Quoted' },
    { key: 'billed', label: 'Billed' },
    { key: 'collected', label: 'Collected' },
    { key: 'totalCost', label: 'Cost' },
    { key: 'estimatedMargin', label: 'Est. Margin' },
    { key: 'actualMargin', label: 'Actual Margin' },
  ]

  function SortTh({ col }) {
    const active = sortCol === col.key
    return (
      <th
        className={styles.th}
        style={{ cursor: 'pointer', userSelect: 'none', textAlign: col.key === 'project_name' ? 'left' : 'right' }}
        onClick={() => onSort(col.key)}
      >
        {col.label}{active ? (sortAsc ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

  return (
    <>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { label: 'Quoted', value: fmtMoney(totals.quoted) },
          { label: 'Billed', value: fmtMoney(totals.billed) },
          { label: 'Collected', value: fmtMoney(totals.collected) },
          { label: 'Total Cost', value: fmtMoney(totals.totalCost) },
          { label: 'Actual Margin', value: blendedMarginPct != null ? fmtPct(blendedMarginPct) : '—' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '12px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>{cols.map(c => <SortTh key={c.key} col={c} />)}</tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.project_id} className={styles.tr} style={{ cursor: 'pointer' }} onClick={() => onSelectProject(r.project_id)}>
                <td className={styles.td}>
                  <div style={{ fontWeight: 600 }}>{r.project_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{r.client_name}</div>
                </td>
                <td className={styles.td} style={{ textAlign: 'right' }}>{fmtMoney(r.quoted)}</td>
                <td className={styles.td} style={{ textAlign: 'right' }}>{fmtMoney(r.billed)}</td>
                <td className={styles.td} style={{ textAlign: 'right' }}>{fmtMoney(r.collected)}</td>
                <td className={styles.td} style={{ textAlign: 'right' }}>
                  {fmtMoney(r.totalCost)}
                  {r.hasIncompleteData && (
                    <span title="Cost may be understated: missing labor rate, material variant, or accepted estimate." style={{ marginLeft: 4, color: 'var(--color-warning, #f59e0b)' }}>⚠︎</span>
                  )}
                </td>
                <td className={styles.td} style={{ textAlign: 'right' }}>
                  <MarginCell amount={r.estimatedMargin} pct={r.estimatedMarginPct} />
                </td>
                <td className={styles.td} style={{ textAlign: 'right' }}>
                  <MarginCell amount={r.actualMargin} pct={r.actualMarginPct} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.totalsRow}>
              <td className={styles.td} style={{ fontWeight: 700 }}>Total ({rows.length} jobs)</td>
              <td className={styles.td} style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(totals.quoted)}</td>
              <td className={styles.td} style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(totals.billed)}</td>
              <td className={styles.td} style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(totals.collected)}</td>
              <td className={styles.td} style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(totals.totalCost)}</td>
              <td className={styles.td}></td>
              <td className={styles.td} style={{ textAlign: 'right', fontWeight: 700 }}>
                <MarginCell amount={totals.collected - totals.totalCost} pct={blendedMarginPct} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

// ── Job detail ──────────────────────────────────────────────────────────

function CostingDetail({ detail, loading, onBack }) {
  if (loading || !detail) return <div className={styles.empty}>Loading...</div>

  const d = detail

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600, fontSize: 13 }}>← Back to all jobs</button>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{d.project_name}</h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 20px' }}>{d.client_name}</p>

      {/* Incomplete data warnings */}
      {d.hasIncompleteData && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--color-warning, #f59e0b)' }}>
          {d.flag_no_accepted_estimate && <div>No accepted estimate — quoted revenue is $0.</div>}
          {d.flag_labor_incomplete && <div>Some time entries are missing a cost rate — labor cost may be understated.</div>}
          {d.flag_materials_incomplete && <div>Some material orders have no selected variant — materials cost may be understated.</div>}
        </div>
      )}

      {/* Revenue */}
      <SectionCard title="Revenue">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Stat label="Quoted" value={fmtMoney(d.quoted)} />
          <Stat label="Billed" value={fmtMoney(d.billed)} />
          <Stat label="Collected" value={fmtMoney(d.collected)} />
        </div>
      </SectionCard>

      {/* Labor */}
      <SectionCard title="Labor" subtitle={fmtMoney(d.laborCost)}>
        {d.laborBreakdown.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No labor logged.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Worker</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>Hours</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>Rate</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {d.laborBreakdown.map((w, i) => (
                <tr key={i} className={styles.tr}>
                  <td className={styles.td}>{w.name}</td>
                  <td className={styles.td} style={{ textAlign: 'right' }}>{w.hours.toFixed(2)}</td>
                  <td className={styles.td} style={{ textAlign: 'right' }}>{fmtMoney(w.rate)}/hr</td>
                  <td className={styles.td} style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(w.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Materials */}
      <SectionCard title="Materials" subtitle={fmtMoney(d.materialsCost)}>
        {d.materialsBreakdown.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No material orders.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Order</th>
                <th className={styles.th}>Store</th>
                <th className={styles.th}>Variant</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {d.materialsBreakdown.map((m, i) => (
                <tr key={i} className={styles.tr}>
                  <td className={styles.td}>{m.title}</td>
                  <td className={styles.td}>{m.store || '—'}</td>
                  <td className={styles.td} style={{ textTransform: 'capitalize' }}>{m.selectedVariant || <span style={{ color: 'var(--color-warning, #f59e0b)' }}>Not set</span>}</td>
                  <td className={styles.td} style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(m.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Expenses */}
      <SectionCard title="Expenses" subtitle={fmtMoney(d.expensesCost)}>
        {d.expensesBreakdown.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No expenses logged.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Description</th>
                <th className={styles.th}>Vendor</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.expensesBreakdown.map(ex => (
                <tr key={ex.id} className={styles.tr}>
                  <td className={styles.td} style={{ whiteSpace: 'nowrap' }}>{ex.expense_date}</td>
                  <td className={styles.td}>{CAT_LABELS[ex.category] || ex.category}</td>
                  <td className={styles.td}>{ex.description}</td>
                  <td className={styles.td}>{ex.vendor || '—'}</td>
                  <td className={styles.td} style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(ex.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Total cost */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg, 8px)', padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Total Cost</span>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{fmtMoney(d.totalCost)}</span>
      </div>

      {/* Margins */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 200, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg, 8px)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 6 }}>Estimated Margin</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>Quoted minus cost</div>
          <MarginCell amount={d.estimatedMargin} pct={d.estimatedMarginPct} large />
        </div>
        <div style={{ flex: 1, minWidth: 200, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg, 8px)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 6 }}>Actual Margin</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>Collected minus cost</div>
          <MarginCell amount={d.actualMargin} pct={d.actualMarginPct} large />
        </div>
      </div>
    </div>
  )
}

// ── Shared helpers ──────────────────────────────────────────────────────

function MarginCell({ amount, pct, large }) {
  const positive = amount >= 0
  const color = positive ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #dc2626)'
  return (
    <span style={{ color, fontWeight: 600, fontSize: large ? 20 : 13 }}>
      {fmtMoney(amount)} {pct != null && <span style={{ fontWeight: 400, fontSize: large ? 14 : 11 }}>({fmtPct(pct)})</span>}
    </span>
  )
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg, 8px)', padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
        {subtitle && <span style={{ fontSize: 15, fontWeight: 700 }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}
