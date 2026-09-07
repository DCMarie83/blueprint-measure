import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { FileText, Mail, Phone, MessageSquare, Users, Send, CheckCircle, XCircle, Eye, Edit, Trash2, Plus, ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react'
import { useClientActivity } from '../../hooks/useClientActivity'
import { useSessionCollapse } from '../../hooks/useSessionCollapse'
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
  bank_details_viewed: { icon: Eye,       label: 'clients:activity.bankDetailsViewed' },
}

// Type filter groups mapped from the activity_type vocabulary; null = all.
const FILTER_TYPES = {
  all: null,
  notes: ['note', 'email', 'call', 'sms', 'meeting'],
  money: [
    'payment_recorded', 'payment_edited', 'payment_deleted',
    'payment_transferred_out', 'payment_transferred_in',
    'invoice_created', 'invoice_sent', 'invoice_paid', 'invoice_voided',
    'invoice_reopened', 'invoice_status_changed', 'invoice_number_changed',
    'invoice_marked_sent', 'invoice_edited_after_send',
  ],
  estimates: ['estimate_sent', 'estimate_viewed', 'estimate_accepted', 'estimate_declined', 'estimate_changes_requested'],
  portal: ['portal_accessed', 'invoice_viewed', 'estimate_viewed', 'bank_details_viewed'],
}
const FILTER_ORDER = ['all', 'notes', 'money', 'estimates', 'portal']

// The collapse default depends on the loaded count, so the session-collapse
// state lives in this shell, mounted only after the first fetch resolves
// (same G57 hook, same semantics: collapsed by default past 8 rows).
function CollapsedShell({ collapseKey, rowCount, title, headerRight, children }) {
  const [collapsed, setCollapsed] = useSessionCollapse(collapseKey, rowCount > 8)
  return (
    <>
      <div className={styles.header}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
        >
          {collapsed ? <ChevronRight size={15} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--color-text-muted)' }} />}
          <h2 className={styles.title} style={{ margin: 0 }}>{title}</h2>
        </button>
        {headerRight}
      </div>
      {!collapsed && children}
    </>
  )
}

export default function ClientActivitySection({ clientId, onChange }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const { activity, totalCount, loading, loadingMore, addActivity, updateActivity, deleteActivity, hasMore, loadMore } = useClientActivity(clientId, { types: FILTER_TYPES[filter] })
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

  if (loading && activity.length === 0 && filter === 'all') return <div className={styles.muted}>{t('clients:activity.loading')}</div>

  return (
    <section className={styles.section}>
      <CollapsedShell
        collapseKey={`client_${clientId}_activity`}
        rowCount={totalCount}
        title={t('clients:activity.titleCount', { count: totalCount })}
        headerRight={(
          <button className={styles.addBtn} onClick={() => setModalActivity(null)}>
            <Plus size={14} /> {t('clients:activity.logActivity')}
          </button>
        )}
      >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
        {FILTER_ORDER.map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              borderRadius: 'var(--radius-pill, 9999px)',
              border: filter === key ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
              background: filter === key ? 'var(--color-primary)' : 'var(--color-surface)',
              color: filter === key ? 'var(--color-on-primary, #fff)' : 'var(--color-text-muted)',
            }}
          >{t(`clients:activity.filter.${key}`)}</button>
        ))}
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
        <button className={styles.loadMoreBtn} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? t('clients:activity.loading') : t('clients:activity.loadMore')}
        </button>
      )}
      </CollapsedShell>

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
