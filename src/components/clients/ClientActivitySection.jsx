import { useState } from 'react'
import { FileText, Mail, Phone, MessageSquare, Users, Send, CheckCircle, XCircle, Eye, Edit, Trash2, Plus } from 'lucide-react'
import { useClientActivity } from '../../hooks/useClientActivity'
import ClientActivityModal from './ClientActivityModal'
import { timeAgo } from '../../utils/timeAgo'
import styles from './ClientActivitySection.module.css'

const TYPE_CONFIG = {
  note:              { icon: FileText,    label: 'Note' },
  email:             { icon: Mail,        label: 'Email' },
  call:              { icon: Phone,       label: 'Call' },
  sms:               { icon: MessageSquare, label: 'SMS' },
  meeting:           { icon: Users,       label: 'Meeting' },
  estimate_sent:     { icon: Send,        label: 'Estimate sent' },
  estimate_viewed:   { icon: Eye,         label: 'Estimate viewed by client' },
  estimate_accepted: { icon: CheckCircle, label: 'Estimate accepted' },
  estimate_declined: { icon: XCircle,     label: 'Estimate declined' },
  invoice_created:   { icon: FileText,    label: 'Invoice created' },
  invoice_sent:      { icon: Send,        label: 'Invoice sent' },
  invoice_viewed:    { icon: Eye,         label: 'Invoice viewed by client' },
  invoice_paid:      { icon: CheckCircle, label: 'Invoice paid' },
  invoice_voided:    { icon: XCircle,     label: 'Invoice voided' },
  portal_accessed:   { icon: Eye,         label: 'Portal accessed' },
}

export default function ClientActivitySection({ clientId, onChange }) {
  const { activity, loading, addActivity, updateActivity, deleteActivity, hasMore, loadMore } = useClientActivity(clientId)
  const [modalActivity, setModalActivity] = useState(undefined) // undefined=closed, null=new, object=edit
  const [deleting, setDeleting] = useState(null)
  const [expanded, setExpanded] = useState({})

  async function handleSave(activityId, payload) {
    if (activityId) {
      await updateActivity(activityId, payload)
    } else {
      await addActivity(payload)
    }
    onChange?.()
  }

  async function handleDelete(item) {
    if (!window.confirm('Delete this activity entry?')) return
    setDeleting(item.id)
    try {
      await deleteActivity(item.id)
      onChange?.()
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <div className={styles.muted}>Loading activity…</div>

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Activity</h2>
        <button className={styles.addBtn} onClick={() => setModalActivity(null)}>
          <Plus size={14} /> Log Activity
        </button>
      </div>

      {activity.length === 0 ? (
        <div className={styles.empty}>
          <FileText size={20} />
          <span>Nothing in the activity log yet — log a call, note, or meeting to start the trail.</span>
        </div>
      ) : (
        <div className={styles.timeline}>
          {activity.map(item => {
            const cfg = TYPE_CONFIG[item.activity_type] ?? TYPE_CONFIG.note
            const Icon = cfg.icon
            const isAuto = item.is_automated
            const isLong = item.body && item.body.length > 200
            const isExpanded = !!expanded[item.id]

            return (
              <div key={item.id} className={styles.entry}>
                <div className={styles.entryIcon}><Icon size={16} /></div>
                <div className={styles.entryBody}>
                  <div className={styles.entryTop}>
                    <div className={styles.entryHeader}>
                      <span className={styles.entryLabel}>{cfg.label}</span>
                      {item.title && <span className={styles.entryTitle}>{item.title}</span>}
                    </div>
                    {!isAuto && (
                      <div className={styles.entryActions}>
                        <button className={styles.iconBtn} onClick={() => setModalActivity(item)} title="Edit"><Edit size={13} /></button>
                        <button className={styles.iconBtn} onClick={() => handleDelete(item)} disabled={deleting === item.id} title="Delete"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                  {item.body && (
                    <div className={`${styles.entryText} ${!isExpanded && isLong ? styles.entryTextClamped : ''}`}>
                      {item.body}
                    </div>
                  )}
                  {isLong && (
                    <button className={styles.showMore} onClick={() => setExpanded(prev => ({ ...prev, [item.id]: !isExpanded }))}>
                      {isExpanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                  <div className={styles.entryMeta}>
                    <span>{timeAgo(item.created_at)}</span>
                    {isAuto && <span className={styles.autoBadge}>Auto</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hasMore && (
        <button className={styles.loadMoreBtn} onClick={loadMore}>Load more</button>
      )}

      {modalActivity !== undefined && (
        <ClientActivityModal
          activity={modalActivity}
          onClose={() => setModalActivity(undefined)}
          onSave={handleSave}
        />
      )}
    </section>
  )
}
