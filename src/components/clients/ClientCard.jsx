import { Link } from 'react-router-dom'
import { Home, Building2 } from 'lucide-react'
import styles from './ClientCard.module.css'

export default function ClientCard({ client, onUnlink }) {
  if (!client) return null

  function handleUnlink() {
    if (window.confirm('Unlink this client from this job?')) {
      onUnlink()
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.icon}>
        {client.client_type === 'commercial' ? <Building2 size={22} /> : <Home size={22} />}
      </div>
      <div className={styles.info}>
        <Link to={`/clients/${client.id}`} className={styles.name}>{client.display_name}</Link>
        {client.business_name && client.client_type === 'commercial' && (
          <div className={styles.biz}>{client.business_name}</div>
        )}
        <div className={styles.contact}>
          {client.primary_email && <span>{client.primary_email}</span>}
          {client.primary_email && client.primary_phone && <span className={styles.dot}>·</span>}
          {client.primary_phone && <span>{client.primary_phone}</span>}
        </div>
      </div>
      <button type="button" className={styles.unlinkBtn} onClick={handleUnlink}>Unlink</button>
    </div>
  )
}
