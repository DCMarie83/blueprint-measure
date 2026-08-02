import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCountUp } from './useCountUp'
import { SUB_DEMO, fmtMoney, unitLabel } from './mockData/subDemo'
import s from './sub.module.css'

const STEPS = 4
const CTA = ["Add today's work", 'Bill my GC', "See what you're owed", 'See the offer']

const { entries, invoice, dashboard } = SUB_DEMO
const hourlyMeta = `${entries.hourly.hours} hr × ${fmtMoney(entries.hourly.rate)}`
const pieceMeta = `${entries.piece.quantity} ${unitLabel(entries.piece.unit)} × ${fmtMoney(entries.piece.rate)}`

// Counts a money figure up from $0 to `value` when it mounts. Rounds the
// in-flight number to whole dollars so the cents never flicker (lands on .00).
function MoneyCountUp({ value, className, duration = 320 }) {
  const [target, setTarget] = useState(0)
  const display = useCountUp(target, duration)
  useEffect(() => { setTarget(value) }, [value])
  return <span className={className}>{fmtMoney(Math.round(display))}</span>
}

export default function TrySubFlow() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // Day total is the one figure that persists across a screen (step 0 → 1), so
  // it uses a step-driven target rather than mount-count: 140 → 680 on the tap.
  const [dayTotalTarget, setDayTotalTarget] = useState(SUB_DEMO.dayTotal.start)
  const dayTotal = useCountUp(dayTotalTarget, 300)
  useEffect(() => {
    if (step >= 1) setDayTotalTarget(SUB_DEMO.dayTotal.full)
  }, [step])

  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  function advance() {
    if (step < STEPS - 1) setStep(step + 1)
    else navigate('/try/done')
  }

  // Keyed per screen GROUP so the slide replays on group change (1→2, 2→3) but
  // the Daily Log stays mounted across 0→1 (entry animates in, total counts).
  const screenKey = step <= 1 ? 'log' : step === 2 ? 'invoice' : 'dash'

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
                  <span className={s.fieldLabel}>Date</span>
                  <span className={s.fieldValue}>{todayLabel}</span>
                </div>
                <div className={s.field}>
                  <span className={s.fieldLabel}>Job</span>
                  <span className={s.fieldValue}>{SUB_DEMO.job}</span>
                </div>
              </div>
              <div className={s.gcLine}>{SUB_DEMO.gc}</div>
            </div>

            <div className={s.card}>
              <div className={s.sectionLabel}>Today's entries</div>

              <div className={s.entryRow}>
                <div className={s.entryMain}>
                  <div className={s.entryName}>{entries.hourly.name}</div>
                  <div className={s.entryMeta}>{hourlyMeta}</div>
                </div>
                <span className={s.entryAmount}>{fmtMoney(entries.hourly.amount)}</span>
              </div>

              {step >= 1 && (
                <div className={`${s.entryRow} ${s.entryEnter}`}>
                  <div className={s.entryMain}>
                    <div className={s.entryName}>{entries.piece.name}</div>
                    <div className={s.entryMeta}>{pieceMeta}</div>
                  </div>
                  <span className={s.entryAmount}>{fmtMoney(entries.piece.amount)}</span>
                </div>
              )}

              <div className={s.dayTotal}>
                <span>Day total</span>
                <span>{fmtMoney(Math.round(dayTotal))}</span>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
          <div className={s.card}>
            <div className={s.invHeader}>
              <div>
                <div className={s.invNumber}>{invoice.number}</div>
                <div className={s.invGc}>{invoice.gc}</div>
              </div>
              <span className={s.statusBadge}>Draft</span>
            </div>

            <div className={s.entryRow}>
              <div className={s.entryMain}>
                <div className={s.entryName}>{entries.hourly.name}</div>
                <div className={s.entryMeta}>{hourlyMeta}</div>
              </div>
              <span className={s.entryAmount}>{fmtMoney(entries.hourly.amount)}</span>
            </div>
            <div className={s.entryRow}>
              <div className={s.entryMain}>
                <div className={s.entryName}>{entries.piece.name}</div>
                <div className={s.entryMeta}>{pieceMeta}</div>
              </div>
              <span className={s.entryAmount}>{fmtMoney(entries.piece.amount)}</span>
            </div>

            <div className={s.dayTotal}>
              <span>Invoice total</span>
              <MoneyCountUp value={invoice.total} />
            </div>
          </div>
          <Link to="/try/sub/reveal" className={s.secondaryLink}>See what your GC sees →</Link>
          </>
        )}

        {step === 3 && (
          <>
            <div className={s.hero}>
              <div className={s.heroLabel}>Owed to you</div>
              <MoneyCountUp value={dashboard.owed.total} className={`${s.heroValue} ${s.moneyGreen}`} duration={480} />
              <p className={s.heroSub}>{dashboard.owed.sub}</p>
            </div>

            <div className={s.statGrid}>
              <div className={s.statCard}>
                <div className={s.statLabel}>Earned MTD</div>
                <MoneyCountUp value={dashboard.earnedMTD} className={`${s.statValue} ${s.moneyOrange}`} />
              </div>
              <div className={s.statCard}>
                <div className={s.statLabel}>Earned YTD</div>
                <MoneyCountUp value={dashboard.earnedYTD} className={`${s.statValue} ${s.moneyOrange}`} />
              </div>
              <div className={s.statCard}>
                <div className={s.statLabel}>Logged this week</div>
                <MoneyCountUp value={dashboard.loggedThisWeek} className={`${s.statValue} ${s.moneyOrange}`} />
              </div>
              <div className={s.statCard}>
                <div className={s.statLabel}>Outstanding</div>
                <MoneyCountUp value={dashboard.outstanding.amount} className={`${s.statValue} ${s.moneyOrange}`} />
                <div className={s.statMeta}>{dashboard.outstanding.count} open · {dashboard.outstanding.paid} paid</div>
              </div>
            </div>

            <div className={s.listRow}>
              <div className={s.entryMain}>
                <div className={s.listSub}>Oldest unpaid</div>
                <div className={s.listName}>{dashboard.oldestUnpaid.number}</div>
                <div className={s.listSub}>
                  {dashboard.oldestUnpaid.gc} · <span className={s.moneyOverdue}>{dashboard.oldestUnpaid.days} days overdue</span>
                </div>
              </div>
            </div>

            <p className={s.payoff}>{SUB_DEMO.payoff}</p>
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
