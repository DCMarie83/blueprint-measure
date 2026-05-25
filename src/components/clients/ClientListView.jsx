import { ChevronRight } from 'lucide-react'
import { timeAgo } from '../../utils/timeAgo'
import styles from './ClientListView.module.css'

const fmtCurrency = (val) => {
  if (val == null || Number(val) === 0) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(val))
}

function getSubtitle(client) {
  if (client.business_name) return client.business_name
  const addr = client.property_address
  const loc = [addr?.city, addr?.state].filter(Boolean).join(', ')
  if (loc) return loc
  return client.client_type === 'commercial' ? 'Commercial client' : 'Residential client'
}

function getInitials(name) {
  return (name || '??').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

export default function ClientListView({ clients, onClickClient }) {
  if (clients.length === 0) return null

  return (
    <div className={styles.list}>
      {clients.map(client => {
        const ltv = Number(client.lifetime_value ?? 0)
        const jobCount = client.active_jobs_count ?? 0

        return (
          <div key={client.id} className={styles.row} onClick={() => onClickClient(client.id)}>
            <div className={styles.avatar}>
              {client.logo_url ? (
                <img src={client.logo_url} alt="" className={styles.avatarImg} />
              ) : (
                <span className={styles.initials}>{getInitials(client.display_name)}</span>
              )}
            </div>

            <div className={styles.center}>
              <h3 className={styles.name}>{client.display_name}</h3>
              <div className={styles.subtitle}>{getSubtitle(client)}</div>
              {client.tags?.length > 0 && (
                <div className={styles.tags}>
                  {client.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
                </div>
              )}
            </div>

            <div className={styles.right}>
              <span className={ltv > 0 ? styles.ltv : styles.ltvZero}>{fmtCurrency(ltv)}</span>
              <span className={styles.meta}>
                {client.last_contact_at ? timeAgo(client.last_contact_at) : 'No contact yet'}
                {jobCount > 0 && <> &middot; {jobCount} job{jobCount !== 1 ? 's' : ''}</>}
              </span>
            </div>

            <div className={styles.chevron}><ChevronRight size={16} /></div>
          </div>
        )
      })}
    </div>
  )
}
