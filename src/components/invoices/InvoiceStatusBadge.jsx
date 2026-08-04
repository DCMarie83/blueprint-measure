import { useTranslation } from 'react-i18next'
import styles from './InvoiceStatusBadge.module.css'

const STATUS_MAP = {
  draft: { label: 'common:invoiceStatus.draft', className: 'draft' },
  sent: { label: 'common:invoiceStatus.sent', className: 'sent' },
  viewed: { label: 'common:invoiceStatus.viewed', className: 'viewed' },
  partial: { label: 'common:invoiceStatus.partial', className: 'partial' },
  paid: { label: 'common:invoiceStatus.paid', className: 'paid' },
  void: { label: 'common:invoiceStatus.void', className: 'void' },
}

export default function InvoiceStatusBadge({ status, isOverdue }) {
  const { t } = useTranslation()
  if (isOverdue && (status === 'sent' || status === 'partial')) {
    return <span className={`${styles.badge} ${styles.overdue}`}>{t('common:invoiceStatus.overdue')}</span>
  }
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.draft
  return <span className={`${styles.badge} ${styles[cfg.className]}`}>{t(cfg.label)}</span>
}
