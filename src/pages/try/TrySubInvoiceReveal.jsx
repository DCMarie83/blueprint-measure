import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, MessageSquare } from 'lucide-react'
import SendMotion from './SendMotion'
import EmailGate from './EmailGate'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import { SUB_DEMO, fmtMoney, unitLabel } from './mockData/subDemo'
import r from './reveal.module.css'

const MOCK_BRAND = '#f27243'
const { business, gc, entries, invoice, paymentMethods } = SUB_DEMO

// Invoice line items = the two logged entries (mirrors the Lite roll-up).
const LINES = [
  { desc: entries.hourly.name, qty: entries.hourly.hours, unit: 'hour', rate: entries.hourly.rate, total: entries.hourly.amount },
  { desc: entries.piece.name, qty: entries.piece.quantity, unit: entries.piece.unit, rate: entries.piece.rate, total: entries.piece.amount },
]
const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function TrySubInvoiceReveal() {
  const { lang } = useTryLang()
  const rv = tr('subReveal', lang)
  const c = tr('common', lang)
  const [phase, setPhase] = useState('sending')
  const issued = fmtDate(new Date())
  const due = fmtDate(new Date(Date.now() + 14 * 86400000))

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
      <div data-theme="light" className={r.lightWrap}>
        <div className={r.reveal}>
          <div className={r.portalCard} style={{ '--brand': MOCK_BRAND }}>
            <div className={r.letterhead}>
              <h2 className={r.companyName}>{business}</h2>
            </div>

            <div className={r.docHeader}>
              <h1 className={r.docTitle}>Invoice</h1>
              <div className={r.docMeta}>{invoice.number} · Issued {issued} · <span className={r.dueEm}>Due {due}</span></div>
              <span className={r.statusPill}>Sent</span>
            </div>

            <div className={r.billedRow}>
              <span className={r.billedLabel}>Billed to</span>
              <span className={r.billedName}>{gc}</span>
            </div>

            <table className={r.docTable}>
              <thead>
                <tr>
                  <th className={r.thL}>Description</th>
                  <th className={r.thR}>Qty</th>
                  <th className={r.thC}>Unit</th>
                  <th className={r.thR}>Rate</th>
                  <th className={r.thR}>Total</th>
                </tr>
              </thead>
              <tbody>
                {LINES.map((li) => (
                  <tr key={li.desc}>
                    <td>{li.desc}</td>
                    <td className={r.tdR}>{li.qty}</td>
                    <td className={r.tdC}>{unitLabel(li.unit)}</td>
                    <td className={r.tdR}>{fmtMoney(li.rate)}</td>
                    <td className={r.tdTotal}>{fmtMoney(li.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={r.totalsWrap}>
              <div className={r.subRow}><span>Subtotal</span><span>{fmtMoney(invoice.total)}</span></div>
              <div className={r.totalRow}><span>Total</span><span>{fmtMoney(invoice.total)}</span></div>
            </div>

            <div className={r.payBlock}>
              <p className={r.payBlockTitle}>Payment Methods</p>
              {paymentMethods.map((m) => <div key={m} className={r.payBlockLine}>{m}</div>)}
            </div>

            <div className={r.respActions}>
              <button className={r.approveBtn}><CheckCircle size={18} /> Approve</button>
              <button className={r.secondaryBtn}><MessageSquare size={16} /> Request changes</button>
            </div>

            <div className={r.referral}>
              <div className={r.referralCard}>
                <div className={r.wordmark}>RivetDog</div>
                <p className={r.refHeadline}>Interested in how RivetDog can make your estimating and jobs easier?</p>
                <p className={r.refSub}>The platform built for trade contractors. Measure, estimate, invoice, get paid.</p>
                <a className={r.refBtn} href="https://rivetdog.com" target="_blank" rel="noopener noreferrer">See RivetDog</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EmailGate flow="sub" caption={rv.gate} />

      <div className={r.revealActions}>
        <Link to="/try/sub" className={r.revealLink}>← {c.back}</Link>
        <Link to="/try" className={r.revealLink}>{c.back}</Link>
      </div>
    </div>
  )
}
