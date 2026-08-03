import { Link } from 'react-router-dom'
import { Phone, Mail, FileText, Briefcase, Search } from 'lucide-react'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import { CLIENTS_DEMO, CLIENT_CHIPS, CLIENT_STATUS_META } from './mockData/clientsDemo'
import s from './sub.module.css'
import g from './gc.module.css'

const fmtMoneyFlat = (v) => (!v || v <= 0 ? '$0' : '$' + Math.round(v).toLocaleString('en-US'))
const initials = (name) => (name || '??').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

// Static glance-only clients list (mirrors ClientListView). Rows are NOT clickable.
export default function TryClientsPeek() {
  const { lang } = useTryLang()
  const p = tr('peeks', lang)
  const c = tr('common', lang)
  return (
    <div className={s.flow}>
      <div className={s.screen}>
        <div className={s.beatHead}>
          <h2 className={s.beatH}>{p.cliH}</h2>
          <p className={s.beatV}>{p.cliV}</p>
        </div>
        <div className={g.clHead}>
          <h1 className={g.clTitle}>Clients</h1>
          <p className={g.clSub}>Manage your residential and commercial clients</p>
        </div>

        <div className={g.clSearchRow}>
          <div className={g.clSearch}>
            <Search size={16} className={g.clSearchIcon} />
            <span className={g.clSearchPlaceholder}>Search clients…</span>
          </div>
          <div className={g.clChips}>
            {CLIENT_CHIPS.map((c) => (
              <span key={c.key} className={`${g.clChip} ${c.active ? g.clChipActive : ''}`}>{c.label} {c.count}</span>
            ))}
          </div>
        </div>

        <div className={g.clTableWrap}>
          <table className={g.clTable}>
            <thead>
              <tr>
                <th className={g.clTh}>Name</th>
                <th className={g.clTh}>Status</th>
                <th className={g.clTh}>Location</th>
                <th className={g.clTh}>Last contact</th>
                <th className={`${g.clTh} ${g.clNumTh}`}>Lifetime value</th>
                <th className={`${g.clTh} ${g.clNumTh}`}>Projects</th>
                <th className={`${g.clTh} ${g.clNumTh}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {CLIENTS_DEMO.map((c) => {
                const meta = CLIENT_STATUS_META[c.status]
                return (
                  <tr key={c.id} className={g.clRow}>
                    <td className={g.clCell}>
                      <div className={g.clNameCell}>
                        <span className={g.clAvatar}>{initials(c.name)}</span>
                        <div className={g.clNameWrap}>
                          <div className={g.clName}>{c.name}</div>
                          {c.business && <div className={g.clBiz}>{c.business}</div>}
                        </div>
                      </div>
                    </td>
                    <td className={g.clCell}>
                      <span className={g.clStatus} style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                    </td>
                    <td className={g.clCell}>{c.location}</td>
                    <td className={`${g.clCell} ${c.lastContact === 'Never' ? g.clMuted : ''}`}>{c.lastContact}</td>
                    <td className={`${g.clCell} ${g.clNum}`}>{fmtMoneyFlat(c.ltv)}</td>
                    <td className={`${g.clCell} ${g.clNum}`}>{c.projects}</td>
                    <td className={`${g.clCell} ${g.clNum}`}>
                      <span className={g.clActions}>
                        {c.phone && <span className={g.clIconBtn}><Phone size={14} /></span>}
                        {c.email && <span className={g.clIconBtn}><Mail size={14} /></span>}
                        <span className={g.clIconBtn}><FileText size={14} /></span>
                        <span className={g.clIconBtn}><Briefcase size={14} /></span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={g.peekActions}>
        <Link to="/try/gc" className={g.peekLink}>← {c.backMenu}</Link>
        <Link to="/try" className={g.peekLink}>{c.back}</Link>
      </div>
    </div>
  )
}
