import { Link } from 'react-router-dom'
import { fmtMoney } from './mockData/subDemo'
import s from './sub.module.css'
import g from './gc.module.css'

// Canned invoices — a paid/outstanding/overdue/void mix so status is legible at
// a glance. Badge classes mirror InvoiceStatusBadge exactly.
const INVOICES = [
  { id: 1, number: 'INV-1042', client: 'Beltline Property Group', project: 'Oakwood Office Repaint', total: 11450, due: 'Aug 24, 2026', created: '2 days ago', badge: 'bSent', label: 'Sent' },
  { id: 2, number: 'INV-1039', client: 'Summit Builders', project: 'Maple Street Repaint', total: 6800, due: 'Aug 10, 2026', created: '5 days ago', badge: 'bPartial', label: 'Partially paid' },
  { id: 3, number: 'INV-1035', client: 'Harbor Point LLC', project: 'Lobby Refinish', total: 4200, due: 'Jul 18, 2026', created: '3 weeks ago', badge: 'bOverdue', label: 'Overdue' },
  { id: 4, number: 'INV-1031', client: 'Cedar & Co.', project: 'Suite 200 Repaint', total: 9300, due: 'Jul 30, 2026', created: '1 month ago', badge: 'bPaid', label: 'Paid in full' },
  { id: 5, number: 'INV-1028', client: 'Beltline Property Group', project: 'Stairwell Coating', total: 2650, due: 'Jul 12, 2026', created: '1 month ago', badge: 'bPaid', label: 'Paid in full' },
  { id: 6, number: 'INV-1024', client: 'Northgate Retail', project: 'Entry Repaint', total: 1800, due: '—', created: '2 months ago', badge: 'bVoid', label: 'Void' },
]

const CHIPS = [
  { key: 'all', label: 'All', count: 6, active: true },
  { key: 'draft', label: 'Draft', count: 0 },
  { key: 'sent', label: 'Sent', count: 1 },
  { key: 'partial', label: 'Partial', count: 1 },
  { key: 'paid', label: 'Paid', count: 2 },
  { key: 'void', label: 'Void', count: 1 },
]

export default function TryInvoicingPeek() {
  return (
    <div className={s.flow}>
      <div className={s.screen}>
        <div className={g.listHead}>
          <h1 className={g.listTitle}>Invoices</h1>
          <p className={g.listSub}>Bill clients and track payments</p>
        </div>

        <div className={g.chipRow}>
          {CHIPS.map((c) => (
            <span key={c.key} className={`${g.chip} ${c.active ? g.chipActive : ''}`}>
              {c.label} ({c.count})
            </span>
          ))}
        </div>

        {INVOICES.map((inv) => (
          <div key={inv.id} className={g.invRow}>
            <div className={g.invMain}>
              <div className={g.invNum}>{inv.number}</div>
              <div className={g.invClient}>{inv.client}</div>
              <div className={g.invProject}>{inv.project}</div>
            </div>
            <div className={g.invRight}>
              <span className={g.invTotal}>{fmtMoney(inv.total)}</span>
              <span className={g.invDue}>{inv.due === '—' ? '—' : `Due ${inv.due}`}</span>
              <span className={`${g.badge} ${g[inv.badge]}`}>{inv.label}</span>
              <span className={g.invCreated}>{inv.created}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={g.peekActions}>
        <Link to="/try/gc" className={g.peekLink}>← Back to menu</Link>
        <Link to="/try" className={g.peekLink}>Back to demo home</Link>
      </div>
    </div>
  )
}
