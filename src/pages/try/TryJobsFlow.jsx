import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import { COLUMNS, STATIC_JOBS, OAKWOOD_JOB, accentFor } from './mockData/jobsDemo'
import s from './sub.module.css'
import g from './gc.module.css'

// Tap-to-advance beat: Oakwood (Review) taps into Sent to Client, then the CTA
// routes to the existing client estimate reveal. Tap, not drag (drag is janky
// on touch). Review (pos 3) → Sent to Client (pos 4) is the real board's
// "ready to send" → "estimate sent" pair.
function JobCard({ job, accent, tappable, landed, onTap }) {
  return (
    <div
      className={`${g.jbCard} ${tappable ? g.jbCardTap : ''} ${landed ? g.jbCardLand : ''}`}
      style={{ borderTop: `3px solid ${accent}` }}
      onClick={tappable ? onTap : undefined}
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onKeyDown={tappable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap() } } : undefined}
    >
      <div className={g.jbCardName}>{job.name}</div>
      {job.address && <div className={g.jbCardAddr}>{job.address}</div>}
      <div className={g.jbCardMeta}>
        <span>{job.blueprints} blueprint{job.blueprints !== 1 ? 's' : ''}</span>
        <span>{job.updated}</span>
      </div>
      {tappable && <div className={g.jbTapHint}>→</div>}
    </div>
  )
}

export default function TryJobsFlow() {
  const navigate = useNavigate()
  const { lang } = useTryLang()
  const f = tr('jobsFlow', lang)
  const c = tr('common', lang)
  const [sent, setSent] = useState(false)
  const boardRef = useRef(null)
  const reviewRef = useRef(null)
  const sentRef = useRef(null)

  // Center the Review column on mount so the beat is in view; after the tap,
  // scroll the Sent column into view so the card is seen landing.
  useEffect(() => {
    reviewRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [])
  useEffect(() => {
    if (sent) sentRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [sent])

  return (
    <div className={s.flow}>
      <div className={g.jbHead}>
        <h1 className={g.jbTitle}>{f.s0h}</h1>
        <p className={g.jbSub}>{f.s0v}</p>
      </div>

      <div className={g.jbBoard} ref={boardRef}>
        {COLUMNS.map((col) => {
          const accent = accentFor(col.pos)
          const staticJobs = STATIC_JOBS[col.id] || []
          const isReview = col.id === 'c3'
          const isSentCol = col.id === 'c4'
          const showOakInReview = isReview && !sent
          const showOakInSent = isSentCol && sent
          const count = staticJobs.length + (showOakInReview || showOakInSent ? 1 : 0)
          const ref = isReview ? reviewRef : isSentCol ? sentRef : null

          return (
            <div key={col.id} className={g.jbColumn} ref={ref}>
              <div className={g.jbColHeader}>
                <span className={g.jbColName}>{col.name}</span>
                <span className={g.jbColCount}>{count}</span>
              </div>
              <div className={g.jbCardList}>
                {showOakInSent && (
                  <JobCard job={OAKWOOD_JOB} accent={accent} landed onTap={() => {}} />
                )}
                {showOakInReview && (
                  <JobCard job={OAKWOOD_JOB} accent={accent} tappable onTap={() => setSent(true)} />
                )}
                {staticJobs.map((j) => (
                  <JobCard key={j.id} job={j} accent={accent} onTap={() => {}} />
                ))}
                {count === 0 && <div className={g.jbEmpty}>—</div>}
              </div>
            </div>
          )
        })}
      </div>

      {sent && (
        <div className={g.jbPayoff}>{f.moved}</div>
      )}

      <div className={s.actions}>
        {sent ? (
          <button className={s.primaryBtn} onClick={() => navigate('/try/gc/estimate/reveal')}>
            {c.seeClient}
          </button>
        ) : (
          <p className={g.jbHint}>{f.tap}</p>
        )}
        <Link to="/try" className={s.backLink}>← {c.back}</Link>
      </div>
    </div>
  )
}
