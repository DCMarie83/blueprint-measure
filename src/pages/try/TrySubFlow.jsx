import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCountUp } from './useCountUp'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import { SUB_DEMO, fmtMoney, unitLabel } from './mockData/subDemo'
import s from './sub.module.css'

const STEPS = 4
const { entries, invoice, dashboard } = SUB_DEMO
const hourlyMeta = `${entries.hourly.hours} hr × ${fmtMoney(entries.hourly.rate)}`
const pieceMeta = `${entries.piece.quantity} ${unitLabel(entries.piece.unit)} × ${fmtMoney(entries.piece.rate)}`

function MoneyCountUp({ value, className, duration = 320 }) {
  const [target, setTarget] = useState(0)
  const display = useCountUp(target, duration)
  useEffect(() => { setTarget(value) }, [value])
  return <span className={className}>{fmtMoney(Math.round(display))}</span>
}

export default function TrySubFlow() {
  const navigate = useNavigate()
  const { lang } = useTryLang()
  const f = tr('subFlow', lang)
  const c = tr('common', lang)
  const end = tr('end', lang)
  const [step, setStep] = useState(0)

  const beats = [
    { h: f.s0h, v: f.s0v }, { h: f.s1h, v: f.s1v }, { h: f.s2h, v: f.s2v }, { h: f.s3h, v: f.s3v },
  ]

  const [dayTotalTarget, setDayTotalTarget] = useState(SUB_DEMO.dayTotal.start)
  const dayTotal = useCountUp(dayTotalTarget, 300)
  useEffect(() => { if (step >= 1) setDayTotalTarget(SUB_DEMO.dayTotal.full) }, [step])

  const todayLabel = new Date().toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  function advance() {
    if (step < STEPS - 1) setStep(step + 1)
    else navigate('/try/done?flow=sub')
  }
  // Intermediate advance labels preview the next beat; the last leads to the offer.
  const ctaLabel = step < STEPS - 1 ? beats[step + 1].h : end.primary

  const screenKey = step <= 1 ? 'log' : step === 2 ? 'invoice' : 'dash'

  return (
    <div className={s.flow}>
      <div className={s.progress} role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <span key={i} className={`${s.dot} ${i <= step ? s.dotOn : ''}`} />
        ))}
      </div>

      <div key={screenKey} className={s.screen}>
        <div className={s.beatHead}>
          <h2 className={s.beatH}>{beats[step].h}</h2>
          <p className={s.beatV}>{beats[step].v}</p>
        </div>

        {step <= 1 && (
          <>
            <div className={s.card}>
              <div className={s.fieldRow}>
                <div className={s.field}><span className={s.fieldLabel}>Date</span><span className={s.fieldValue}>{todayLabel}</span></div>
                <div className={s.field}><span className={s.fieldLabel}>Job</span><span className={s.fieldValue}>{SUB_DEMO.job}</span></div>
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
              <div className={s.dayTotal}><span>Day total</span><span>{fmtMoney(Math.round(dayTotal))}</span></div>
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
              <div className={s.dayTotal}><span>Invoice total</span><MoneyCountUp value={invoice.total} /></div>
            </div>
            <Link to="/try/sub/reveal" className={s.secondaryLink}>{c.seeGc} →</Link>
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
              <div className={s.statCard}><div className={s.statLabel}>Earned MTD</div><MoneyCountUp value={dashboard.earnedMTD} className={`${s.statValue} ${s.moneyOrange}`} /></div>
              <div className={s.statCard}><div className={s.statLabel}>Earned YTD</div><MoneyCountUp value={dashboard.earnedYTD} className={`${s.statValue} ${s.moneyOrange}`} /></div>
              <div className={s.statCard}><div className={s.statLabel}>Logged this week</div><MoneyCountUp value={dashboard.loggedThisWeek} className={`${s.statValue} ${s.moneyOrange}`} /></div>
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
                <div className={s.listSub}>{dashboard.oldestUnpaid.gc} · <span className={s.moneyOverdue}>{dashboard.oldestUnpaid.days} days overdue</span></div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={s.actions}>
        <button className={s.primaryBtn} onClick={advance}>{ctaLabel}</button>
        <Link to="/try" className={s.backLink}>← {c.back}</Link>
      </div>
    </div>
  )
}
