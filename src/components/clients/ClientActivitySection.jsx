import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { FileText, Mail, Phone, MessageSquare, Users, Send, CheckCircle, XCircle, Eye, Edit, Trash2, Plus, ArrowUpRight } from 'lucide-react'
import { useClientActivity } from '../../hooks/useClientActivity'
import ClientActivityModal from './ClientActivityModal'
import { timeAgo } from '../../utils/timeAgo'
import { activityLink } from '../../lib/clientsView'
import styles from './ClientActivitySection.module.css'

const TYPE_CONFIG = {
  note:              { icon: FileText,    label: 'common:manualType.note' },
  email:             { icon: Mail,        label: 'common:manualType.email' },
  call:              { icon: Phone,       label: 'common:manualType.call' },
  sms:               { icon: MessageSquare, label: 'common:manualType.sms' },
  meeting:           { icon: Users,       label: 'common:manualType.meeting' },
  estimate_sent:     { icon: Send,        label: 'clients:activity.estimateSent' },
  estimate_viewed:   { icon: Eye,         label: 'clients:activity.estimateViewed' },
  estimate_accepted: { icon: CheckCircle, label: 'clients:activity.estimateAccepted' },
  estimate_declined: { icon: XCircle,     label: 'clients:activity.estimateDeclined' },
  invoice_created:   { icon: FileText,    label: 'clients:activity.invoiceCreated' },
  invoice_sent:      { icon: Send,        label: 'clients:activity.invoiceSent' },
  invoice_viewed:    { icon: Eye,         label: 'clients:activity.invoiceViewed' },
  invoice_paid:      { icon: CheckCircle, label: 'clients:activity.invoicePaid' },
  invoice_voided:    { icon: XCircle,     label: 'clients:activity.invoiceVoided' },
  portal_accessed:   { icon: Eye,         label: 'clients:activity.portalAccessed' },
}

export default function ClientActivitySection({ clientId, onChange }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
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
    if (!window.confirm(t('clients:activity.confirmDelete'))) return
    setDeleting(item.id)
    try {
      await deleteActivity(item.id)
      onChange?.()
    } catch (err) {
      alert(t('clients:errors.deleteFailed', { error: err.message }))
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <div className={styles.muted}>{t('clients:activity.loading')}</div>

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('clients:activity.title')}</h2>
        <button className={styles.addBtn} onClick={() => setModalActivity(null)}>
          <Plus size={14} /> {t('clients:activity.logActivity')}
        </button>
      </div>

      {activity.length === 0 ? (
        <div className={styles.empty}>
          <FileText size={20} />
          <span>{t('clients:activity.empty')}</span>
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
                      <span className={styles.entryLabel}>{t(cfg.label)}</span>
                      {item.title && <span className={styles.entryTitle}>{item.title}</span>}
                    </div>
                    {!isAuto && (
                      <div className={styles.entryActions}>
                        <button className={styles.iconBtn} onClick={() => setModalActivity(item)} title={t('common:action.edit')}><Edit size={13} /></button>
                        <button className={styles.iconBtn} onClick={() => handleDelete(item)} disabled={deleting === item.id} title={t('common:action.delete')}><Trash2 size={13} /></button>
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
                      {isExpanded ? t('clients:activity.showLess') : t('clients:activity.showMore')}
                    </button>
                  )}
                  <div className={styles.entryMeta}>
                    <span>{timeAgo(item.created_at)}</span>
                    {isAuto && <span className={styles.autoBadge}>{t('clients:activity.auto')}</span>}
                    {(() => {
                      const to = activityLink(item)
                      return to ? (
                        <button
                          onClick={() => navigate(to)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#F27243', fontSize: 12, fontWeight: 600 }}
                        >
                          {t('clients:activity.view')} <ArrowUpRight size={12} />
                        </button>
                      ) : null
                    })()}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hasMore && (
        <button className={styles.loadMoreBtn} onClick={loadMore}>{t('clients:activity.loadMore')}</button>
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
