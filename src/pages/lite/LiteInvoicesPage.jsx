import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, ChevronRight } from 'lucide-react'
import InvoiceStatusBadge from '../../components/invoices/InvoiceStatusBadge'
import { useInvoices, isOverdue } from '../../hooks/useInvoices'
import { useClients } from '../../hooks/useClients'
import { GC_CLIENT_TYPE, fmtMoney } from '../../lib/lite'
import styles from './lite.module.css'

// Lite "/invoices" — a flat list of the sub's invoices. GC name comes from the
// invoice's own client_id (set at creation), falling back to the project join.
export default function LiteInvoicesPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { invoices, loading } = useInvoices()
  const { clients } = useClients()

  function gcNameFor(inv) {
    const byClient = clients.find(c => c.id === inv.client_id && c.client_type === GC_CLIENT_TYPE)
    if (byClient) return byClient.business_name || byClient.display_name
    return inv.projects?.clients?.display_name || t('lite:invoices.noGc')
  }

  function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString() : ''
  }

  // The GC's own response to the invoice, if they've reviewed it online. Any
  // value starting with "approv" is an approval; anything else set means the GC
  // asked for changes.
  function gcResponseFor(inv) {
    if (!inv.gc_approval) return null
    return String(inv.gc_approval).toLowerCase().startsWith('approv')
      ? { label: t('lite:invoices.gcApproved'), approved: true }
      : { label: t('lite:invoices.changesRequested'), approved: false }
  }

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{t('lite:invoices.title')}</h1>
            <p className={styles.subtitle}>{t('lite:invoices.subtitle')}</p>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>{t('lite:invoices.loading')}</div>
        ) : invoices.length === 0 ? (
          <div className={styles.empty}>
            <FileText size={44} />
            <div className={styles.emptyTitle}>{t('lite:invoices.emptyTitle')}</div>
            <p>{t('lite:invoices.emptyHelp')}</p>
            <button className={styles.linkBtn} style={{ marginTop: 12 }} onClick={() => navigate('/jobs')}>{t('lite:invoices.goToJobs')}</button>
          </div>
        ) : (
          invoices.map(inv => (
            <button key={inv.id} className={styles.listRow} onClick={() => navigate(`/invoices/${inv.id}`)}>
              <div className={styles.entryMain}>
                <div className={styles.listName}>{inv.invoice_number}</div>
                <div className={styles.listSub}>{gcNameFor(inv)}{inv.created_at ? ` · ${fmtDate(inv.created_at)}` : ''}</div>
              </div>
              <div className={styles.listRight}>
                <div className={`${styles.entryAmount} ${
                  inv.status === 'paid' ? styles.moneyIn
                    : inv.status === 'void' ? ''
                    : isOverdue(inv) ? styles.moneyOverdue
                    : styles.moneyDue
                }`}>{fmtMoney(inv.total)}</div>
                <div style={{ marginTop: 4 }}><InvoiceStatusBadge status={inv.status} isOverdue={isOverdue(inv)} /></div>
                {(() => {
                  const r = gcResponseFor(inv)
                  return r ? (
                    <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: r.approved ? 'var(--color-success)' : 'var(--color-warning, #b45309)' }}>{r.label}</div>
                  ) : null
                })()}
              </div>
              <ChevronRight size={18} className={styles.muted} />
            </button>
          ))
        )}
      </main>
    </div>
  )
}
