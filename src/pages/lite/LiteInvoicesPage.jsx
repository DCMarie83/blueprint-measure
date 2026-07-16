import { useNavigate } from 'react-router-dom'
import { FileText, ChevronRight } from 'lucide-react'
import AppHeader from '../../components/AppHeader'
import InvoiceStatusBadge from '../../components/invoices/InvoiceStatusBadge'
import { useInvoices, isOverdue } from '../../hooks/useInvoices'
import { useClients } from '../../hooks/useClients'
import { GC_CLIENT_TYPE, fmtMoney } from '../../lib/lite'
import styles from './lite.module.css'

// Lite "/invoices" — a flat list of the sub's invoices. GC name comes from the
// invoice's own client_id (set at creation), falling back to the project join.
export default function LiteInvoicesPage() {
  const navigate = useNavigate()
  const { invoices, loading } = useInvoices()
  const { clients } = useClients()

  function gcNameFor(inv) {
    const byClient = clients.find(c => c.id === inv.client_id && c.client_type === GC_CLIENT_TYPE)
    if (byClient) return byClient.business_name || byClient.display_name
    return inv.projects?.clients?.display_name || 'No GC'
  }

  function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString() : ''
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Invoices</h1>
            <p className={styles.subtitle}>Everything you've billed your GCs</p>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div className={styles.empty}>
            <FileText size={44} />
            <div className={styles.emptyTitle}>No invoices yet</div>
            <p>Open a job and create an invoice from its unbilled entries.</p>
            <button className={styles.linkBtn} style={{ marginTop: 12 }} onClick={() => navigate('/jobs')}>Go to jobs</button>
          </div>
        ) : (
          invoices.map(inv => (
            <button key={inv.id} className={styles.listRow} onClick={() => navigate(`/invoices/${inv.id}`)}>
              <div className={styles.entryMain}>
                <div className={styles.listName}>{inv.invoice_number}</div>
                <div className={styles.listSub}>{gcNameFor(inv)}{inv.created_at ? ` · ${fmtDate(inv.created_at)}` : ''}</div>
              </div>
              <div className={styles.listRight}>
                <div className={styles.entryAmount}>{fmtMoney(inv.total)}</div>
                <div style={{ marginTop: 4 }}><InvoiceStatusBadge status={inv.status} isOverdue={isOverdue(inv)} /></div>
              </div>
              <ChevronRight size={18} className={styles.muted} />
            </button>
          ))
        )}
      </main>
    </div>
  )
}
