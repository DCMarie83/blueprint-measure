import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, FileText, HardHat, ChevronRight, Check } from 'lucide-react'
import Logo from '../../components/brand/Logo'
import OpenPunchBar from '../../components/lite/OpenPunchBar'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useAuth } from '../../context/AuthContext'
import { useLiteHomeStats } from '../../hooks/useLiteHomeStats'
import { useOpenPunch } from '../../hooks/useOpenPunch'
import { fmtMoney } from '../../lib/lite'
import { getEffectiveTimeZone, formatHeaderDateTime, zoneShortName } from '../../lib/effectiveTime'
import styles from './lite.module.css'

// The Lite home. Hero "Owed to you", quick actions, a 2×2 earnings grid, and
// the two "what next" cards (jump back in / oldest unpaid). Every figure comes
// pre-computed from useLiteHomeStats — this file only lays them out. Money lines
// are pun-free; only the brand-new welcome line is allowed a wag.
export default function LiteHomePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()
  const { userProfile } = useAuth()
  const tz = getEffectiveTimeZone(userProfile)
  const {
    owed, earnedMTD, earnedYTD, loggedThisWeek, outstanding, paidCount,
    oldestUnpaid, jumpBackIn, flags, loading, refetch: refetchStats,
  } = useLiteHomeStats(companyId)
  const { openPunch, refetch: refetchPunch } = useOpenPunch(companyId)

  async function handleClockedOut() {
    await Promise.all([refetchPunch(), refetchStats()])
  }

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
        
        <main className={styles.main}><div className={styles.loading}>{t('common:misc.loading')}</div></main>
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
    { done: flags.hasGC, label: t('lite:home.stepAddGc'), to: '/gcs' },
    { done: flags.hasEntry, label: t('lite:home.stepSetRates'), to: '/log' },
    { done: flags.hasInvoice, label: t('lite:home.stepSendInvoice'), to: '/jobs' },
  ]

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        {/* Identity-first header: the long-form logo, centered and capped, then
            one section line above the money hero. */}
        <div className={styles.homeLogoRow}>
          <Logo variant="full" className={styles.homeLogo} />
        </div>
        <div className={styles.standRow}>
          <div className={styles.sectionLine}>{t('lite:home.whereYouStand')}</div>
          <div className={styles.clockLine}>{clock}{tzSuffix ? ` (${tzSuffix})` : ''}</div>
        </div>

        {/* Running-punch indicator — same DB-derived bar as the log page. */}
        {openPunch && <OpenPunchBar punch={openPunch} onDone={handleClockedOut} compact />}

        {/* Hero */}
        {isBrandNew ? (
          <div className={styles.hero}>
            <div className={styles.heroLabel}>{t('lite:home.welcome')}</div>
            <div className={styles.heroValue} style={{ fontSize: 24 }}>{t('lite:home.fetchFirstDollar')}</div>
            <p className={styles.heroSub}>{t('lite:home.brandNewSub')}</p>
          </div>
        ) : (
          <div className={styles.hero}>
            <div className={styles.heroLabel}>{t('lite:home.owedToYou')}</div>
            <div className={`${styles.heroValue} ${styles.moneyDue}`}>{fmtMoney(owed.total)}</div>
            <p className={styles.heroSub}>
              {t('lite:home.owedSub', { invoiced: fmtMoney(owed.invoicedAwaiting), logged: fmtMoney(owed.loggedNotInvoiced) })}
            </p>
          </div>
        )}

        {/* Quick actions */}
        <div className={styles.quickRow}>
          <button className={styles.quickAction} onClick={() => navigate('/log')}><Plus size={18} /> {t('lite:home.logWork')}</button>
          <button className={styles.quickAction} onClick={() => navigate('/jobs')}><FileText size={18} /> {t('lite:home.newInvoice')}</button>
          <button className={styles.quickAction} onClick={() => navigate('/gcs')}><HardHat size={18} /> {t('lite:home.addGc')}</button>
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
                <div className={styles.statLabel}>{t('lite:home.earnedMtd')}</div>
                <div className={`${styles.statValue} ${styles.moneyIn}`}>{fmtMoney(earnedMTD)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>{t('lite:home.earnedYtd')}</div>
                <div className={`${styles.statValue} ${styles.moneyIn}`}>{fmtMoney(earnedYTD)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>{t('lite:home.loggedThisWeek')}</div>
                <div className={styles.statValue}>{fmtMoney(loggedThisWeek)}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>{t('lite:home.outstanding')}</div>
                <div className={`${styles.statValue} ${styles.moneyDue}`}>{fmtMoney(outstanding.amount)}</div>
                <div className={styles.entryMeta} style={{ marginTop: 2 }}>{t('lite:home.openPaid', { open: outstanding.count, paid: paidCount })}</div>
              </div>
            </div>

            {jumpBackIn && (
              <button className={styles.listRow} onClick={() => navigate(`/log?job=${jumpBackIn.projectId}`)}>
                <div className={styles.entryMain}>
                  <div className={styles.listSub}>{t('lite:home.jumpBackIn')}</div>
                  <div className={styles.listName}>{jumpBackIn.name}</div>
                  <div className={styles.listSub}>{jumpBackIn.gcName} · <span className={styles.moneyDue}>{fmtMoney(jumpBackIn.unbilled)}</span> {t('lite:home.unbilled')}</div>
                </div>
                <ChevronRight size={18} className={styles.muted} />
              </button>
            )}

            {oldestUnpaid && (
              <button className={styles.listRow} onClick={() => navigate(`/invoices/${oldestUnpaid.id}`)}>
                <div className={styles.entryMain}>
                  <div className={styles.listSub}>{t('lite:home.oldestUnpaid')}</div>
                  <div className={styles.listName}>{oldestUnpaid.invoice_number}</div>
                  <div className={styles.listSub}>{oldestUnpaid.gcName} · <span className={oldestUnpaid.overdue ? styles.moneyOverdue : styles.moneyDue}>{t('lite:home.daysStatus', { count: oldestUnpaid.days, context: oldestUnpaid.overdue ? 'overdue' : 'outstanding' })}</span></div>
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
                  >{t('lite:home.remind')}</span>
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
