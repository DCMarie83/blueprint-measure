import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Download } from 'lucide-react'
import InvoiceTable from '../../components/invoices/InvoiceTable'
import { useInvoiceSort, useInvoicePaidMap, sortInvoiceRows } from '../../components/invoices/invoiceListShared'
import { exportInvoicesCSV, exportInvoicesXLSX } from '../../utils/invoiceListXLSX'
import { useInvoices } from '../../hooks/useInvoices'
import { useClients } from '../../hooks/useClients'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { GC_CLIENT_TYPE } from '../../lib/lite'
import styles from './lite.module.css'

const LITE_SORT_KEY = 'rivetdog_lite_invoice_sort'

// Lite "/invoices" — the sub's invoices on the same sortable table and export
// the Pro list uses (one implementation, shared components). GC name comes
// from the invoice's own client_id (set at creation), falling back to the
// project join.
export default function LiteInvoicesPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { companyId, company } = useEffectiveCompany()
  const { invoices, loading } = useInvoices()
  const { clients } = useClients()
  const paidMap = useInvoicePaidMap(companyId)
  const { sortCol, sortAsc, handleSort } = useInvoiceSort(LITE_SORT_KEY)

  function gcNameFor(inv) {
    const byClient = clients.find(c => c.id === inv.client_id && c.client_type === GC_CLIENT_TYPE)
    if (byClient) return byClient.business_name || byClient.display_name
    return inv.projects?.clients?.display_name || t('lite:invoices.noGc')
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

  const sortCtx = { paidMap, clientNameOf: gcNameFor }
  const sorted = sortInvoiceRows(invoices, sortCol, sortAsc, sortCtx)

  function handleExport(kind) {
    const args = { rows: sorted, ctx: sortCtx, company }
    if (kind === 'csv') exportInvoicesCSV(args)
    else exportInvoicesXLSX(args).catch(err => console.error('Invoice XLSX:', err))
  }

  return (
    <div className={styles.page}>

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{t('lite:invoices.title')}</h1>
            <p className={styles.subtitle}>{t('lite:invoices.subtitle')}</p>
          </div>
          {invoices.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.linkBtn} onClick={() => handleExport('csv')}><Download size={14} /> {t('invoices:list.exportCsv')}</button>
              <button className={styles.linkBtn} onClick={() => handleExport('xlsx')}><Download size={14} /> {t('invoices:list.exportExcel')}</button>
            </div>
          )}
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
          <InvoiceTable
            rows={sorted}
            paidMap={paidMap}
            clientNameOf={gcNameFor}
            sortCol={sortCol}
            sortAsc={sortAsc}
            onSort={handleSort}
            onRowClick={inv => navigate(`/invoices/${inv.id}`)}
            renderStatusExtra={inv => {
              const r = gcResponseFor(inv)
              return r ? (
                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: r.approved ? 'var(--color-success)' : 'var(--color-warning, #b45309)' }}>{r.label}</div>
              ) : null
            }}
          />
        )}
      </main>
    </div>
  )
}
