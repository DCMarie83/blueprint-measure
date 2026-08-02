import { useState, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import SendMotion from './SendMotion'
import EmailGate from './EmailGate'
import { fmtMoney, unitLabel } from './mockData/subDemo'
import { ESTIMATE_DEMO } from './mockData/estimateDemo'
import r from './reveal.module.css'

const MOCK_BRAND = '#f27243'
const { company, client, job, lineItems, total } = ESTIMATE_DEMO

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

export default function TryEstimateReveal() {
  const [phase, setPhase] = useState('sending')
  const [accepting, setAccepting] = useState(false)
  const [name, setName] = useState('')
  const [checked, setChecked] = useState(false)

  if (phase === 'sending') {
    return (
      <div className={r.revealWrap}>
        <SendMotion line="Here's what your client sees." onDone={() => setPhase('revealed')} />
      </div>
    )
  }

  return (
    <div className={r.revealWrap}>
      <div data-theme="light" className={r.lightWrap}>
        <div className={r.reveal}>
          <div className={r.portalCard} style={{ '--brand': MOCK_BRAND }}>
            <div className={r.letterhead}>
              <h2 className={r.companyName}>{company}</h2>
              <div className={r.projectName}>{job}</div>
            </div>

            <div className={r.singleBar}>
              <span className={r.singleBarLabel}>{job}</span>
              <span className={r.singleBarTotal}>{fmtMoney(total)}</span>
            </div>

            <div>
              {GROUPS.map(({ cat, items }) => (
                <Fragment key={cat}>
                  <div className={r.catHeader}>{cat}</div>
                  {items.map((li) => (
                    <div key={li.id} className={r.lineGrid}>
                      <span>{li.description}</span>
                      <span className={r.lineQty}>{li.unit === 'lump_sum' ? '—' : `${li.quantity.toLocaleString()} ${unitLabel(li.unit)}`}</span>
                      <span className={r.lineRate}>{fmtMoney(li.rate)}</span>
                      <span className={r.lineTotal}>{fmtMoney(li.total)}</span>
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>

            <div className={r.grandBar} style={{ marginTop: 16 }}>
              <span>Total</span>
              <span className={r.grandBarValue}>{fmtMoney(total)}</span>
            </div>

            {!accepting ? (
              <div className={r.estActionRow}>
                <button className={r.acceptGreen} onClick={() => setAccepting(true)}><Check size={16} /> Accept Estimate</button>
                <button className={r.secondaryBtn}>Request changes</button>
                <button className={r.secondaryBtn}><X size={16} /> Decline</button>
              </div>
            ) : (
              <div className={r.confirmForm}>
                <h3 className={r.confirmTitle}>Accept Estimate</h3>
                <label className={r.fieldLabel}>Your Name
                  <input
                    className={r.nameInput}
                    type="text"
                    placeholder="Type your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </label>
                {name.trim() && (
                  <p className={r.confirmText}>I, <strong>{name.trim()}</strong>, accept this estimate totaling <strong>{fmtMoney(total)}</strong>.</p>
                )}
                <label className={r.checkboxRow}>
                  <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                  I understand this constitutes acceptance of the estimate.
                </label>
                <div className={r.confirmActions}>
                  <button className={r.cancelBtn} onClick={() => setAccepting(false)}>Cancel</button>
                  <button className={r.confirmAccept} disabled={!name.trim() || !checked}>Confirm Acceptance</button>
                </div>
              </div>
            )}

            <p className={r.portalFooter}>Powered by RivetDog for {company}</p>
          </div>
        </div>
      </div>

      <EmailGate flow="estimate" caption="This is what your customer sees when you send an estimate." />

      <div className={r.revealActions}>
        <Link to="/try/gc" className={r.revealLink}>← Back to menu</Link>
        <Link to="/try" className={r.revealLink}>Back to demo home</Link>
      </div>
    </div>
  )
}
