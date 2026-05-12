import { useParams, useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import { useEstimate } from '../hooks/useEstimates'
import { useClients } from '../hooks/useClients'
import styles from './EstimateDetailPage.module.css'

const STATUS_CLASS = {
  draft: styles.statusDraft,
  sent: styles.statusSent,
  accepted: styles.statusAccepted,
  declined: styles.statusDeclined,
  expired: styles.statusExpired,
}

export default function EstimateDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { estimate, loading, error } = useEstimate(id)
  const { clients } = useClients()

  if (loading) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}><div className={styles.empty}>Loading...</div></main>
      </div>
    )
  }

  if (error || !estimate) {
    return (
      <div className={styles.page}>
        <AppHeader />
        <main className={styles.main}><div className={styles.empty}>{error || 'Estimate not found'}</div></main>
      </div>
    )
  }

  const client = clients.find(c => c.id === estimate.client_id)
  const lineItems = estimate.estimate_line_items ?? []

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <BackLink to={`/project/${estimate.project_id}`} label="Back to project" />

        <div className={styles.headerRow}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>{estimate.estimate_number || 'Estimate'}</h1>
            <span className={`${styles.statusBadge} ${STATUS_CLASS[estimate.status] || styles.statusDraft}`}>
              {estimate.status}
            </span>
          </div>
        </div>

        {/* Project info card */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Project Info</h3>
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Project</span>
            <span className={styles.cardValue}>{estimate.project_id || '--'}</span>
          </div>
          {client && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Client</span>
              <span className={styles.cardValue}>{client.display_name}</span>
            </div>
          )}
          <div className={styles.cardRow}>
            <span className={styles.cardLabel}>Created</span>
            <span className={styles.cardValue}>{new Date(estimate.created_at).toLocaleDateString()}</span>
          </div>
          {estimate.expires_at && (
            <div className={styles.cardRow}>
              <span className={styles.cardLabel}>Expires</span>
              <span className={styles.cardValue}>{new Date(estimate.expires_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Notes</h3>
          <textarea
            className={styles.notesArea}
            defaultValue={estimate.notes || ''}
            placeholder="Add notes..."
            readOnly
          />
        </div>

        {/* Line items */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Line Items</h3>
          {lineItems.length === 0 ? (
            <div className={styles.lineItemsEmpty}>No line items yet. Add items from your pricing library.</div>
          ) : (
            lineItems.map(li => (
              <div key={li.id} className={styles.cardRow}>
                <span>{li.name}</span>
                <span>${(li.total ?? 0).toFixed(2)}</span>
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        <div className={styles.totalsCard}>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span>$0.00</span>
          </div>
          <div className={styles.totalRow}>
            <span>Tax</span>
            <span>$0.00</span>
          </div>
          <div className={styles.totalRow}>
            <span>Total</span>
            <span>$0.00</span>
          </div>
        </div>

        <button
          className={styles.deleteBtn}
          onClick={() => {
            if (window.confirm('Delete this estimate?')) {
              navigate(`/project/${estimate.project_id}`)
            }
          }}
        >
          <Trash2 size={15} /> Delete Estimate
        </button>
      </main>
    </div>
  )
}
