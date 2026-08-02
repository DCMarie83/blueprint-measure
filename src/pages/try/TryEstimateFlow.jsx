import { useState, useEffect, Fragment } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCountUp } from './useCountUp'
import { fmtMoney, unitLabel } from './mockData/subDemo'
import { ESTIMATE_DEMO } from './mockData/estimateDemo'
import s from './sub.module.css'
import g from './gc.module.css'

const STEPS = 3
const CTA = ['Build my estimate', 'See the total', 'See what your client sees']
const { job, client, lineItems, total } = ESTIMATE_DEMO

// Group line items by category, preserving first-seen order (mirrors GroupRows).
function grouped() {
  const order = []
  const map = {}
  for (const li of lineItems) {
    if (!map[li.category]) { map[li.category] = []; order.push(li.category) }
    map[li.category].push(li)
  }
  return order.map((cat) => ({ cat, items: map[cat] }))
}
const GROUPS = grouped()

function MoneyCountUp({ value, className, duration = 900 }) {
  const [target, setTarget] = useState(0)
  const display = useCountUp(target, duration)
  useEffect(() => { setTarget(value) }, [value])
  return <span className={className}>{fmtMoney(Math.round(display))}</span>
}

export default function TryEstimateFlow() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // Running total climbs from $0 to the full total across step 1 (the build).
  const [runTarget, setRunTarget] = useState(0)
  const runTotal = useCountUp(runTarget, 1000)
  useEffect(() => {
    if (step >= 1) setRunTarget(total)
  }, [step])

  function advance() {
    if (step < STEPS - 1) setStep(step + 1)
    else navigate('/try/gc/estimate/reveal')
  }

  // Steps 0 & 1 share the builder screen; step 2 is the grand-total reveal.
  const screenKey = step <= 1 ? 'build' : 'total'

  let flatIndex = -1

  return (
    <div className={s.flow}>
      <div className={s.progress} role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <span key={i} className={`${s.dot} ${i <= step ? s.dotOn : ''}`} />
        ))}
      </div>

      <div key={screenKey} className={s.screen}>
        {step <= 1 && (
          <>
            <div className={s.card}>
              <div className={s.fieldRow}>
                <div className={s.field}>
                  <span className={s.fieldLabel}>Job</span>
                  <span className={s.fieldValue}>{job}</span>
                </div>
                <div className={s.field}>
                  <span className={s.fieldLabel}>Client</span>
                  <span className={s.fieldValue}>{client}</span>
                </div>
              </div>
            </div>

            {/* Line-items table — orange-bordered container, mirrors EstimateDetailPage */}
            <div className={g.estWrap}>
              {step === 0 ? (
                <div className={g.emptyEstimate}>No line items yet. Tap “Build my estimate.”</div>
              ) : (
                <table className={g.estTable}>
                  <thead>
                    <tr>
                      <th className={g.estTh}>Description</th>
                      <th className={g.estTh}>Unit</th>
                      <th className={`${g.estTh} ${g.thNum}`}>Qty</th>
                      <th className={`${g.estTh} ${g.thNum}`}>Rate</th>
                      <th className={`${g.estTh} ${g.thNum}`}>Total</th>
                      <th className={`${g.estTh} ${g.thAction}`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {GROUPS.map(({ cat, items }) => (
                      <Fragment key={cat}>
                        <tr className={g.catRow}><td colSpan={6} className={g.catCell}>{cat}</td></tr>
                        {items.map((li) => {
                          flatIndex += 1
                          const isLump = li.unit === 'lump_sum'
                          return (
                            <tr key={li.id} className={g.itemEnter} style={{ animationDelay: `${flatIndex * 90}ms` }}>
                              <td className={g.tdDesc}>{li.description}</td>
                              <td className={g.tdUnit}>{unitLabel(li.unit)}</td>
                              <td className={g.tdNum}>{isLump ? <span className={g.mutedDash}>—</span> : li.quantity.toLocaleString()}</td>
                              <td className={g.tdNum}>{fmtMoney(li.rate)}</td>
                              <td className={g.tdNum}>{fmtMoney(li.total)}</td>
                              <td className={g.tdAction} />
                            </tr>
                          )
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {step === 1 && (
              <div className={g.totalsCard}>
                <div className={g.totalsRow}>
                  <span>Estimate Total</span>
                  <span className={g.totalsValue}>{fmtMoney(Math.round(runTotal))}</span>
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div className={g.grandCard}>
              <div className={g.grandLabel}>Estimate total</div>
              <MoneyCountUp value={total} className={g.grandValue} duration={700} />
              <div className={g.grandJob}>{job}</div>
              <div className={g.grandClient}>{client}</div>
              <div className={g.singleNote}>One clear price — client-ready.</div>
            </div>
            <p className={s.payoff}>{ESTIMATE_DEMO.payoff}</p>
          </>
        )}
      </div>

      <div className={s.actions}>
        <button className={s.primaryBtn} onClick={advance}>{CTA[step]}</button>
        <Link to="/try" className={s.backLink}>← Back to demo home</Link>
      </div>
    </div>
  )
}
