import { Link } from 'react-router-dom'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import { fmtMoney } from './mockData/subDemo'
import s from './sub.module.css'
import g from './gc.module.css'

// Job Costing → Portfolio (admin view). KPI cards each carry a colored 3px LEFT
// rail AND a functional value color, mirroring ReportsPage's semantics with the
// app's tokens: revenue (Quoted/Billed/Collected) = money-in green, cost =
// neutral muted, Actual Margin = green ≥0 / red <0 as a percentage.
// (The real app's revenue rail #26464C is invisible on the dark teal card, so
// the revenue group uses the success token here — kept visible in both themes.)
const KPIS = [
  { label: 'Quoted', value: fmtMoney(84200), rail: 'var(--color-success)', val: 'valRevenue' },
  { label: 'Billed', value: fmtMoney(71600), rail: 'var(--color-success)', val: 'valRevenue' },
  { label: 'Collected', value: fmtMoney(63400), rail: 'var(--color-success)', val: 'valRevenue' },
  { label: 'Total Cost', value: fmtMoney(48900), rail: 'var(--color-text-muted)', val: 'valCost' },
]

// Actual Margin = (collected - cost) / collected.
const marginPct = Math.round(((63400 - 48900) / 63400) * 100)

const JOBS = [
  { name: 'Oakwood Office Repaint', quoted: 11450, billed: 11450, collected: 8000, cost: 6900, margin: 14 },
  { name: 'Maple Street Repaint', quoted: 6800, billed: 6800, collected: 6800, cost: 4100, margin: 40 },
  { name: 'Lobby Refinish', quoted: 4200, billed: 4200, collected: 0, cost: 3050, margin: -27 },
  { name: 'Suite 200 Repaint', quoted: 9300, billed: 9300, collected: 9300, cost: 6200, margin: 33 },
]

export default function TryReportingPeek() {
  const { lang } = useTryLang()
  const p = tr('peeks', lang)
  const c = tr('common', lang)
  return (
    <div className={s.flow}>
      <div className={s.screen}>
        <div className={s.beatHead}>
          <h2 className={s.beatH}>{p.repH}</h2>
          <p className={s.beatV}>{p.repV}</p>
        </div>
        <h1 className={g.repHead}>Reports</h1>

        <div className={g.pillRow}>
          <span className={g.pill}>Pay Report</span>
          <span className={`${g.pill} ${g.pillActive}`}>Job Costing</span>
        </div>
        <div className={g.pillRow}>
          <span className={`${g.pill} ${g.pillActive}`}>Portfolio</span>
          <span className={g.pill}>Period Summary</span>
        </div>

        <div className={g.kpiRow}>
          {KPIS.map((k) => (
            <div key={k.label} className={g.kpiCard} style={{ borderLeft: `3px solid ${k.rail}` }}>
              <div className={g.kpiLabel}>{k.label}</div>
              <div className={`${g.kpiValue} ${g[k.val]}`}>{k.value}</div>
            </div>
          ))}
          <div className={`${g.kpiCard} ${g.kpiMargin}`} style={{ borderLeft: '3px solid var(--color-primary)' }}>
            <div className={g.kpiLabel}>Actual Margin</div>
            <div className={`${g.kpiValue} ${marginPct >= 0 ? g.marginPos : g.marginNeg}`}>{marginPct}%</div>
          </div>
        </div>

        <div className={s.card}>
          <div className={g.tableWrap}>
            <table className={g.jobTable}>
              <thead>
                <tr>
                  <th>Job</th><th>Quoted</th><th>Billed</th><th>Collected</th><th>Cost</th><th>Actual Margin</th>
                </tr>
              </thead>
              <tbody>
                {JOBS.map((j) => (
                  <tr key={j.name}>
                    <td>{j.name}</td>
                    <td className={g.valRevenue}>{fmtMoney(j.quoted)}</td>
                    <td className={g.valRevenue}>{fmtMoney(j.billed)}</td>
                    <td className={g.valRevenue}>{fmtMoney(j.collected)}</td>
                    <td className={g.valCost}>{fmtMoney(j.cost)}</td>
                    <td className={j.margin >= 0 ? g.marginPos : g.marginNeg}>{j.margin}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={g.peekActions}>
        <Link to="/try/gc" className={g.peekLink}>← {c.backMenu}</Link>
        <Link to="/try" className={g.peekLink}>{c.back}</Link>
      </div>
    </div>
  )
}
