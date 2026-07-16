import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, HardHat, ChevronRight, Check } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import Logo from '../../components/brand/Logo'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useLiteHomeStats } from '../../hooks/useLiteHomeStats'
import { fmtMoney } from '../../lib/lite'
import { timeGreeting, randomTagline } from '../../lib/liteVoice'
import styles from './lite.module.css'

// The Lite home. Hero "Owed to you", quick actions, a 2×2 earnings grid, and
// the two "what next" cards (jump back in / oldest unpaid). Every figure comes
// pre-computed from useLiteHomeStats — this file only lays them out. Money lines
// are pun-free; only the brand-new welcome line is allowed a wag.
export default function LiteHomePage() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const { companyId, company } = useEffectiveCompany()
  const {
    owed, earnedMTD, earnedYTD, loggedThisWeek, outstanding, paidCount,
    oldestUnpaid, jumpBackIn, flags, loading,
  } = useLiteHomeStats(companyId)

  // Tagline holds steady within a session, rotates on reload (mount-time pick).
  const [tagline] = useState(randomTagline)

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

  const steps = [
    { done: flags.hasGC, label: 'Add your GC', to: '/gcs' },
    { done: flags.hasEntry, label: 'Set your rates as you log', to: '/log' },
    { done: flags.hasInvoice, label: 'Send your first invoice', to: '/jobs' },
  ]

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{company?.name || 'Home'}</h1>
            <p className={styles.subtitle}>Here's where you stand today.</p>
          </div>
        </div>

        {/* Mascot greeting — personality block, kept visually apart from money. */}
        <div className={styles.greeting}>
          <Logo variant="mark" className={styles.greetingMark} />
          <div className={styles.greetingText}>{timeGreeting(userProfile?.full_name)}</div>
          <div className={styles.greetingTag}>{tagline}</div>
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
            <div className={styles.heroValue}>{fmtMoney(owed.total)}</div>
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
                <div className={styles.statValue}>{fmtMoney(earnedMTD)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Earned YTD</div>
                <div className={styles.statValue}>{fmtMoney(earnedYTD)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Logged this week</div>
                <div className={styles.statValue}>{fmtMoney(loggedThisWeek)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Outstanding</div>
                <div className={styles.statValue}>{fmtMoney(outstanding.amount)}</div>
                <div className={styles.entryMeta} style={{ marginTop: 2 }}>{outstanding.count} open · {paidCount} paid</div>
              </div>
            </div>

            {jumpBackIn && (
              <button className={styles.listRow} onClick={() => navigate(`/log?job=${jumpBackIn.projectId}`)}>
                <div className={styles.entryMain}>
                  <div className={styles.listSub}>Jump back in</div>
                  <div className={styles.listName}>{jumpBackIn.name}</div>
                  <div className={styles.listSub}>{jumpBackIn.gcName} · {fmtMoney(jumpBackIn.unbilled)} unbilled</div>
                </div>
                <ChevronRight size={18} className={styles.muted} />
              </button>
            )}

            {oldestUnpaid && (
              <button className={styles.listRow} onClick={() => navigate(`/invoices/${oldestUnpaid.id}`)}>
                <div className={styles.entryMain}>
                  <div className={styles.listSub}>Oldest unpaid</div>
                  <div className={styles.listName}>{oldestUnpaid.invoice_number}</div>
                  <div className={styles.listSub}>{oldestUnpaid.gcName} · {oldestUnpaid.days} day{oldestUnpaid.days === 1 ? '' : 's'} outstanding</div>
                </div>
                <ChevronRight size={18} className={styles.muted} />
              </button>
            )}
          </>
        )}
      </main>
    </div>
  )
}
