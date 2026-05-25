import styles from './InvoiceStatusBadge.module.css'

const STATUS_MAP = {
  draft: { label: 'Draft', className: 'draft' },
  sent: { label: 'Sent', className: 'sent' },
  viewed: { label: 'Viewed', className: 'viewed' },
  paid: { label: 'Paid', className: 'paid' },
  void: { label: 'Void', className: 'void' },
}

export default function InvoiceStatusBadge({ status, isOverdue }) {
  if (isOverdue && status === 'sent') {
    return <span className={`${styles.badge} ${styles.overdue}`}>Overdue</span>
  }
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.draft
  return <span className={`${styles.badge} ${styles[cfg.className]}`}>{cfg.label}</span>
}
