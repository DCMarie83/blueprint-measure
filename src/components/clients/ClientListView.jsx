import { ChevronUp, ChevronDown, Phone, Mail, FileText, Briefcase } from 'lucide-react'
import { timeAgo } from '../../utils/timeAgo'
import { statusMeta, initials, fmtMoneyFlat, clientLocation, AVATAR_GRADIENT } from '../../lib/clientsView'
import './clientsView.css'

const th = { position: 'sticky', top: 0, zIndex: 1, background: 'var(--color-surface, #fff)', borderBottom: '1px solid var(--color-border)', padding: '10px 12px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'left', whiteSpace: 'nowrap' }
const td = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--color-border)', verticalAlign: 'middle' }
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'none' }

function SortHeader({ label, colKey, sortKey, sortDir, onSort, align = 'left' }) {
  const active = sortKey === colKey
  return (
    <th style={{ ...th, textAlign: align, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort(colKey)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active && (sortDir === 'asc'
          ? <ChevronUp size={13} style={{ color: '#F27243' }} />
          : <ChevronDown size={13} style={{ color: '#F27243' }} />)}
      </span>
    </th>
  )
}

function StatusChip({ status }) {
  const m = statusMeta(status)
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700, background: m.bg, color: m.fg, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

export default function ClientListView({ clients, sortKey, sortDir, onSort, onRowClick, onNewEstimate, onNewJob, onQuickTrack }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortHeader label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th style={th}>Location</th>
            <SortHeader label="Last contact" colKey="last_contact" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <SortHeader label="Lifetime value" colKey="lifetime_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            <th style={{ ...th, textAlign: 'right' }}>Projects</th>
            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map(client => {
            const loc = clientLocation(client)
            const phone = client.primary_phone
            const email = client.primary_email
            const jobCount = client.active_jobs_count ?? 0
            return (
              <tr key={client.id} className="cv-row" style={{ cursor: 'pointer' }}>
                {/* Name + company (click-through) */}
                <td style={td} onClick={() => onRowClick(client)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: AVATAR_GRADIENT, color: '#fff', fontSize: 12, fontWeight: 700 }}>
                      {client.logo_url ? <img src={client.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(client.display_name)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text, #1b2426)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.display_name}</div>
                      {client.business_name && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.business_name}</div>}
                    </div>
                  </div>
                </td>
                <td style={td} onClick={() => onRowClick(client)}><StatusChip status={client.status} /></td>
                <td style={{ ...td, color: loc ? 'var(--color-text)' : 'var(--color-text-muted)' }} onClick={() => onRowClick(client)}>{loc || '—'}</td>
                <td style={{ ...td, color: client.last_contact_at ? 'var(--color-text)' : 'var(--color-text-muted)' }} onClick={() => onRowClick(client)}>
                  {client.last_contact_at ? timeAgo(client.last_contact_at) : 'Never'}
                </td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} onClick={() => onRowClick(client)}>{fmtMoneyFlat(client.lifetime_value)}</td>
                <td style={{ ...td, textAlign: 'right' }} onClick={() => onRowClick(client)}>{jobCount}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {phone && (
                      <a style={iconBtn} href={`tel:${phone}`} title="Call" onClick={() => onQuickTrack(client, 'call')}><Phone size={14} /></a>
                    )}
                    {email && (
                      <a style={iconBtn} href={`mailto:${email}`} title="Email" onClick={() => onQuickTrack(client, 'email')}><Mail size={14} /></a>
                    )}
                    <button style={iconBtn} title="New Estimate" onClick={() => onNewEstimate(client)}><FileText size={14} /></button>
                    <button style={iconBtn} title="New Job" onClick={() => onNewJob(client)}><Briefcase size={14} /></button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
