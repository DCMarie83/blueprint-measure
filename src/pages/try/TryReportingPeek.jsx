import { Link } from 'react-router-dom'
import { fmtMoney } from './mockData/subDemo'
import s from './sub.module.css'
import g from './gc.module.css'

// Job Costing → Portfolio (the admin view). KPI cards + a small job table,
// mirroring ReportsPage's CostingPortfolio. Canned figures.
const KPIS = [
  { label: 'Quoted', value: 84200 },
  { label: 'Billed', value: 71600 },
  { label: 'Collected', value: 63400 },
  { label: 'Total Cost', value: 48900 },
]

const JOBS = [
  { name: 'Oakwood Office Repaint', quoted: 11450, billed: 11450, collected: 8000, cost: 6900, margin: 21 },
  { name: 'Maple Street Repaint', quoted: 6800, billed: 6800, collected: 6800, cost: 4100, margin: 40 },
  { name: 'Lobby Refinish', quoted: 4200, billed: 4200, collected: 0, cost: 3050, margin: 27 },
  { name: 'Suite 200 Repaint', quoted: 9300, billed: 9300, collected: 9300, cost: 6200, margin: 33 },
]

// Actual margin = (collected - cost) / collected across the portfolio.
const actualMargin = Math.round(((63400 - 48900) / 63400) * 100)

export default function TryReportingPeek() {
  return (
    <div className={s.flow}>
      <div className={s.screen}>
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
            <div key={k.label} className={g.kpiCard}>
              <div className={g.kpiLabel}>{k.label}</div>
              <div className={g.kpiValue}>{fmtMoney(k.value)}</div>
            </div>
          ))}
          <div className={`${g.kpiCard} ${g.kpiAccent}`}>
            <div className={g.kpiLabel}>Actual Margin</div>
            <div className={`${g.kpiValue} ${g.marginPos}`}>{actualMargin}%</div>
          </div>
        </div>

        <div className={s.card}>
          <div className={g.tableWrap}>
            <table className={g.jobTable}>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Quoted</th>
                  <th>Billed</th>
                  <th>Collected</th>
                  <th>Cost</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {JOBS.map((j) => (
                  <tr key={j.name}>
                    <td>{j.name}</td>
                    <td>{fmtMoney(j.quoted)}</td>
                    <td>{fmtMoney(j.billed)}</td>
                    <td>{fmtMoney(j.collected)}</td>
                    <td>{fmtMoney(j.cost)}</td>
                    <td className={g.marginPos}>{j.margin}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={g.peekActions}>
        <Link to="/try/gc" className={g.peekLink}>← Back to menu</Link>
        <Link to="/try" className={g.peekLink}>Back to demo home</Link>
      </div>
    </div>
  )
}
