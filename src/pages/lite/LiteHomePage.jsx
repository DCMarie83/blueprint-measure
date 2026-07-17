import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, HardHat, ChevronRight, Check } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import Logo from '../../components/brand/Logo'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useAuth } from '../../context/AuthContext'
import { useLiteHomeStats } from '../../hooks/useLiteHomeStats'
import { fmtMoney } from '../../lib/lite'
import { getEffectiveTimeZone, formatHeaderDateTime, zoneShortName } from '../../lib/effectiveTime'
import styles from './lite.module.css'

// The Lite home. Hero "Owed to you", quick actions, a 2×2 earnings grid, and
// the two "what next" cards (jump back in / oldest unpaid). Every figure comes
// pre-computed from useLiteHomeStats — this file only lays them out. Money lines
// are pun-free; only the brand-new welcome line is allowed a wag.
export default function LiteHomePage() {
  const navigate = useNavigate()
  const { companyId } = useEffectiveCompany()
  const { userProfile } = useAuth()
  const tz = getEffectiveTimeZone(userProfile)
  const {
    owed, earnedMTD, earnedYTD, loggedThisWeek, outstanding, paidCount,
    oldestUnpaid, jumpBackIn, flags, loading,
  } = useLiteHomeStats(companyId)

  // Live wall clock in the effective zone. Ticks each minute (no seconds shown),
  // cleaned up on unmount. Kept before any early return so hook order is stable.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  // Hold the shell until the effective company resolves (impersonation-safe).
  if (!companyId || loading) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}><div className={styles.loading}>Loading…</div></main>
      </div>
    )
  }

  const isBrandNew = !flags.hasEntry && !flags.hasInvoice
  const allStepsDone = flags.hasGC && flags.hasEntry && flags.hasInvoice

  // "Friday, July 17 · 4:12 PM". The zone suffix (e.g. "ET") shows only when the
  // sub has set a non-automatic zone, so an automatic device zone stays clutter-free.
  const clock = formatHeaderDateTime(tz, now)
  const tzSuffix = userProfile?.timezone ? zoneShortName(tz, now) : ''

  const steps = [
    { done: flags.hasGC, label: 'Add your GC', to: '/gcs' },
    { done: flags.hasEntry, label: 'Set your rates as you log', to: '/log' },
    { done: flags.hasInvoice, label: 'Send your first invoice', to: '/jobs' },
  ]

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        {/* Identity-first header: the long-form logo, centered and capped, then
            one section line above the money hero. */}
        <div className={styles.homeLogoRow}>
          <Logo variant="full" className={styles.homeLogo} />
        </div>
        <div className={styles.standRow}>
          <div className={styles.sectionLine}>Here's where you stand</div>
          <div className={styles.clockLine}>{clock}{tzSuffix ? ` (${tzSuffix})` : ''}</div>
        </div>

        {/* Hero */}
        {isBrandNew ? (
          <div className={styles.hero}>
            <div className={styles.heroLabel}>Welcome</div>
            <div className={styles.heroValue} style={{ fontSize: 24 }}>Let's fetch your first dollar</div>
            <p className={styles.heroSub}>Add a GC and log your first work — your pay stacks up right here as you go.</p>
          </div>
        ) : (
          <div className={styles.hero}>
            <div className={styles.heroLabel}>Owed to you</div>
            <div className={`${styles.heroValue} ${styles.moneyDue}`}>{fmtMoney(owed.total)}</div>
            <p className={styles.heroSub}>
              {fmtMoney(owed.invoicedAwaiting)} invoiced awaiting payment · {fmtMoney(owed.loggedNotInvoiced)} logged, not yet invoiced
            </p>
          </div>
        )}

        {/* Quick actions */}
        <div className={styles.quickRow}>
          <button className={styles.quickAction} onClick={() => navigate('/log')}><Plus size={18} /> Log work</button>
          <button className={styles.quickAction} onClick={() => navigate('/jobs')}><FileText size={18} /> New invoice</button>
          <button className={styles.quickAction} onClick={() => navigate('/gcs')}><HardHat size={18} /> Add GC</button>
        </div>

        {/* Getting-started strip — auto-hides once all three are done */}
        {!allStepsDone && (
          <div className={styles.stepStrip}>
            {steps.map((s, i) => (
              <button key={i} className={`${styles.step} ${s.done ? styles.stepDone : ''}`} onClick={() => navigate(s.to)}>
                <span className={`${styles.stepNum} ${s.done ? styles.stepNumDone : ''}`}>
                  {s.done ? <Check size={13} /> : i + 1}
                </span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Numbers + what-next (skipped while brand-new) */}
        {!isBrandNew && (
          <>
            <div className={styles.statGrid}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Earned MTD</div>
                <div className={`${styles.statValue} ${styles.moneyIn}`}>{fmtMoney(earnedMTD)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Earned YTD</div>
                <div className={`${styles.statValue} ${styles.moneyIn}`}>{fmtMoney(earnedYTD)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Logged this week</div>
                <div className={styles.statValue}>{fmtMoney(loggedThisWeek)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Outstanding</div>
                <div className={`${styles.statValue} ${styles.moneyDue}`}>{fmtMoney(outstanding.amount)}</div>
                <div className={styles.entryMeta} style={{ marginTop: 2 }}>{outstanding.count} open · {paidCount} paid</div>
              </div>
            </div>

            {jumpBackIn && (
              <button className={styles.listRow} onClick={() => navigate(`/log?job=${jumpBackIn.projectId}`)}>
                <div className={styles.entryMain}>
                  <div className={styles.listSub}>Jump back in</div>
                  <div className={styles.listName}>{jumpBackIn.name}</div>
                  <div className={styles.listSub}>{jumpBackIn.gcName} · <span className={styles.moneyDue}>{fmtMoney(jumpBackIn.unbilled)}</span> unbilled</div>
                </div>
                <ChevronRight size={18} className={styles.muted} />
              </button>
            )}

            {oldestUnpaid && (
              <button className={styles.listRow} onClick={() => navigate(`/invoices/${oldestUnpaid.id}`)}>
                <div className={styles.entryMain}>
                  <div className={styles.listSub}>Oldest unpaid</div>
                  <div className={styles.listName}>{oldestUnpaid.invoice_number}</div>
                  <div className={styles.listSub}>{oldestUnpaid.gcName} · <span className={oldestUnpaid.overdue ? styles.moneyOverdue : styles.moneyDue}>{oldestUnpaid.days} day{oldestUnpaid.days === 1 ? '' : 's'} {oldestUnpaid.overdue ? 'overdue' : 'outstanding'}</span></div>
                </div>
                {oldestUnpaid.remindable && (
                  // A span (not a nested <button>, which is invalid inside this
                  // button card). stopPropagation keeps the card's own navigate
                  // from firing; the deep-link opens the reminder confirm on land.
                  <span
                    role="button"
                    tabIndex={0}
                    className={styles.remindChip}
                    onClick={e => { e.stopPropagation(); navigate(`/invoices/${oldestUnpaid.id}?remind=1`) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); navigate(`/invoices/${oldestUnpaid.id}?remind=1`) } }}
                  >Remind</span>
                )}
                <ChevronRight size={18} className={styles.muted} />
              </button>
            )}
          </>
        )}
      </main>
    </div>
  )
}
