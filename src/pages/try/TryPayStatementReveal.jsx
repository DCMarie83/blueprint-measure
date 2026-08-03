import { useState } from 'react'
import { Link } from 'react-router-dom'
import SendMotion from './SendMotion'
import EmailGate from './EmailGate'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import { fmtMoney } from './mockData/subDemo'
import { CREW_DEMO } from './mockData/crewDemo'
import r from './reveal.module.css'

const PS = CREW_DEMO.payStatement

export default function TryPayStatementReveal() {
  const { lang } = useTryLang()
  const rv = tr('payReveal', lang)
  const c = tr('common', lang)
  const [phase, setPhase] = useState('sending')

  if (phase === 'sending') {
    return (
      <div className={r.revealWrap}>
        <SendMotion line={rv.caption} onDone={() => setPhase('revealed')} />
      </div>
    )
  }

  return (
    <div className={r.revealWrap}>
      <div className={r.revealHead}>
        <h2 className={r.revealCaption}>{rv.caption}</h2>
        <p className={r.revealValue}>{rv.value}</p>
      </div>
      <div className={r.reveal}>
        <div className={r.payDoc}>
          <div className={r.payTop}>
            <span className={r.payCompany}>{PS.company}</span>
            <span className={r.payDocTitle}>PAY STATEMENT</span>
          </div>
          <div className={r.payAddress}>
            {PS.address.map((l) => <div key={l}>{l}</div>)}
          </div>
          <div className={r.payPeriod}>Period: {PS.period.from} – {PS.period.to}</div>
          <hr className={r.payRule} />
          <div className={r.payWorkerLabel}>WORKER</div>
          <div className={r.payWorkerName}>{PS.worker}</div>

          <div className={r.paySummary}>
            <div className={r.paySumItem}>
              <div className={r.paySumLabel}>Total Hours</div>
              <div className={r.paySumValue}>{PS.totalHours.toFixed(2)}</div>
            </div>
            <div className={r.paySumItem}>
              <div className={r.paySumLabel}>Rate</div>
              <div className={r.paySumValue}>{fmtMoney(PS.rate)}/hr</div>
            </div>
            <div className={r.paySumItem}>
              <div className={r.paySumLabel}>Gross Pay</div>
              <div className={r.paySumValue}>{fmtMoney(PS.gross)}</div>
            </div>
          </div>

          <p className={r.paySectionTitle}>By Job</p>
          <table className={r.payTable}>
            <thead>
              <tr><th>Job</th><th>Hours</th><th>Pay</th></tr>
            </thead>
            <tbody>
              {PS.byJob.map((j) => (
                <tr key={j.job}><td>{j.job}</td><td>{j.hours.toFixed(2)}</td><td>{fmtMoney(j.pay)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td>{PS.totalHours.toFixed(2)}</td><td>{fmtMoney(PS.gross)}</td></tr>
            </tfoot>
          </table>

          <p className={r.paySectionTitle}>Detail</p>
          <table className={r.payTable}>
            <thead>
              <tr><th>Date</th><th>Job</th><th>Hours</th><th>Rate</th><th>Pay</th></tr>
            </thead>
            <tbody>
              {PS.detail.map((d, i) => (
                <tr key={i}>
                  <td>{d.date}</td>
                  <td>{d.job}</td>
                  <td>{d.hours.toFixed(2)}</td>
                  <td>{fmtMoney(PS.rate)}/hr</td>
                  <td>{fmtMoney(d.pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={r.grossPill}>
            <span>GROSS PAY</span>
            <span>{fmtMoney(PS.gross)}</span>
          </div>

          <div className={r.payFoot}>
            <span>{PS.company}</span>
            <span>{PS.worker} — {PS.period.from} to {PS.period.to}</span>
          </div>
        </div>
      </div>

      <EmailGate flow="crew" caption={rv.gate} />

      <div className={r.revealActions}>
        <Link to="/try/gc" className={r.revealLink}>← {c.backMenu}</Link>
        <Link to="/try" className={r.revealLink}>{c.back}</Link>
      </div>
    </div>
  )
}
