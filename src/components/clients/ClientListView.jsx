import { Home, Building2, ChevronRight } from 'lucide-react'
import { RESIDENTIAL_PROPERTY_TYPES, COMMERCIAL_PROPERTY_TYPES } from '../../data/clientPropertyTypes'
import { timeAgo } from '../../utils/timeAgo'
import styles from './ClientListView.module.css'

const PROPERTY_LABELS = Object.fromEntries(
  [...RESIDENTIAL_PROPERTY_TYPES, ...COMMERCIAL_PROPERTY_TYPES].map(t => [t.value, t.label])
)

export default function ClientListView({ clients, onClickClient }) {
  if (clients.length === 0) return null

  return (
    <div className={styles.list}>
      {clients.map(client => {
        const addr = client.property_address
        const location = [addr?.city, addr?.state].filter(Boolean).join(', ')
        const propertyLabel = client.property_type ? (PROPERTY_LABELS[client.property_type] ?? client.property_type.replace(/_/g, ' ')) : null

        return (
          <div key={client.id} className={styles.row} onClick={() => onClickClient(client.id)}>
            <div className={styles.icon}>
              {client.client_type === 'commercial' ? <Building2 size={20} /> : <Home size={20} />}
            </div>

            <div className={styles.identity}>
              <h3 className={styles.name}>{client.display_name}</h3>
              {client.business_name && client.client_type === 'commercial' && (
                <span className={styles.biz}>{client.business_name}</span>
              )}
            </div>

            <div className={styles.contact}>
              {client.primary_email && <span>{client.primary_email}</span>}
              {client.primary_email && client.primary_phone && <span className={styles.dot}>·</span>}
              {client.primary_phone && <span>{client.primary_phone}</span>}
            </div>

            <div className={styles.meta}>
              {propertyLabel && <span className={styles.badge}>{propertyLabel}</span>}
              {location && <span className={styles.location}>{location}</span>}
            </div>

            <div className={styles.stats}>
              <span>{client.active_jobs_count ?? 0} job{(client.active_jobs_count ?? 0) !== 1 ? 's' : ''}</span>
            </div>

            <div className={styles.updated}>
              {client.updated_at && <span>Updated {timeAgo(client.updated_at)}</span>}
            </div>

            <div className={styles.chevron}>
              <ChevronRight size={16} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
