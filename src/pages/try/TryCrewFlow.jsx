import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MapPin, Check } from 'lucide-react'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import { CREW_DEMO } from './mockData/crewDemo'
import s from './sub.module.css'
import g from './gc.module.css'

const STEPS = 4
const { company, worker, job, clockInTime, shareLink, pending } = CREW_DEMO

export default function TryCrewFlow() {
  const navigate = useNavigate()
  const { lang } = useTryLang()
  const f = tr('crewFlow', lang)
  const c = tr('common', lang)
  const beats = [{ h: f.s0h, v: f.s0v }, { h: f.s1h, v: f.s1v }, { h: f.s2h, v: f.s2v }, { h: f.s3h, v: f.s3v }]
  const [step, setStep] = useState(0)

  // Phone: auto-transition from "Clock In" to the running timer shortly after
  // the worker screen mounts, so the beat shows visible motion on one tap.
  const [punchedIn, setPunchedIn] = useState(false)
  useEffect(() => {
    if (step !== 1) { setPunchedIn(false); return }
    const t = setTimeout(() => setPunchedIn(true), 300)
    return () => clearTimeout(t)
  }, [step])

  // Approvals: which pending punches the GC has approved (flourish within step 2).
  const [approved, setApproved] = useState({})

  function advance() {
    if (step < STEPS - 1) setStep(step + 1)
    else navigate('/try/gc/crew/reveal')
  }

  const screenKey = ['share', 'phone', 'approvals', 'payoff'][step]

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

        {/* STEP 0 — share link / QR */}
        {step === 0 && (
          <div className={s.card}>
            <div className={g.shareCard}>
              <div className={g.qr} aria-hidden="true">
                <span className={`${g.qrFinder} ${g.qrTL}`} />
                <span className={`${g.qrFinder} ${g.qrTR}`} />
                <span className={`${g.qrFinder} ${g.qrBL}`} />
              </div>
              <div className={g.shareLink}>{shareLink}</div>
            </div>
          </div>
        )}

        {/* STEP 1 — worker phone view (mirror RivetPayLinkPage) */}
        {step === 1 && (
          <div className={g.phoneFrame}>
            <div className={g.phoneScreen}>
              <div className={g.clockCompany}>{company}</div>
              <div className={g.clockWorker}>Hi, {worker}</div>

              {!punchedIn ? (
                <button className={g.clockInBtn}>Clock In</button>
              ) : (
                <div className={g.clockedInBox}>
                  <div className={g.clockStatus}>CLOCKED IN</div>
                  <div className={g.clockJobLabel}>{job}</div>
                  <div className={g.clockSince}>since {clockInTime}</div>
                  <div className={g.clockTimer}>0:00:04</div>
                  <div className={g.geoRow}><span className={g.geoDot} /> Location captured</div>
                  <button className={g.clockOutBtn}>Clock Out</button>
                </div>
              )}

              <div className={g.phoneFooter}>Powered by RivetDog</div>
            </div>
          </div>
        )}

        {/* STEP 2 — GC pending approvals (mirror TimePage Team tab) */}
        {step === 2 && (
          <div className={s.card}>
            <div className={g.apprHead}>
              Pending Approvals
              <span className={g.apprBadge}>{pending.length}</span>
            </div>
            <div className={g.apprTableWrap}>
              <table className={g.apprTable}>
                <thead>
                  <tr>
                    <th>Worker</th><th>Job</th><th>Date</th><th>Time</th>
                    <th className={g.apprNum}>Hours</th><th>Loc</th><th>Source</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.id}>
                      <td className={g.apprStrong}>{p.worker}</td>
                      <td>{p.job}</td>
                      <td>{p.date}</td>
                      <td className={g.apprTime}>{p.time}</td>
                      <td className={g.apprNum}>{p.hours.toFixed(2)}</td>
                      <td>
                        <span className={g.apprLoc}><MapPin size={11} /> loc</span>
                      </td>
                      <td className={g.apprMuted}>{p.source}</td>
                      <td className={g.apprActions}>
                        {approved[p.id] ? (
                          <span className={g.approvedTag}>✓ Approved</span>
                        ) : (
                          <>
                            <button className={g.approveBtn} onClick={() => setApproved((a) => ({ ...a, [p.id]: true }))}>Approve</button>
                            <button className={g.rejectBtn}>Reject</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STEP 3 — payoff (copy lives in the beat header above) */}
        {step === 3 && (
          <div className={`${s.card} ${g.crewDone}`}>
            <span className={g.crewDoneCheck}><Check size={26} /></span>
          </div>
        )}
      </div>

      <div className={s.actions}>
        <button className={s.primaryBtn} onClick={advance}>{step < STEPS - 1 ? beats[step + 1].h : c.seePay}</button>
        <Link to="/try" className={s.backLink}>← {c.back}</Link>
      </div>
    </div>
  )
}
