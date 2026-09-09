import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Search, Plus, Upload, FileScan, Download } from 'lucide-react'
import Modal from '../components/ui/Modal'
import InvoiceImportModal from '../components/invoices/InvoiceImportModal'
import DocumentImportModal from '../components/import/DocumentImportModal'
import InvoiceTable from '../components/invoices/InvoiceTable'
import { useInvoiceSort, useInvoicePaidMap, sortInvoiceRows } from '../components/invoices/invoiceListShared'
import { exportInvoicesCSV, exportInvoicesXLSX } from '../utils/invoiceListXLSX'
import { useInvoices } from '../hooks/useInvoices'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import styles from './InvoiceListPage.module.css'

const STATUS_FILTERS = ['all', 'draft', 'sent', 'partial', 'paid', 'void']
const SORT_STORAGE_KEY = 'rivetdog_invoice_sort'

// Date range on invoice date, persisted like the Jobs board window. Default
// 'all': a money list never hides rows until the operator narrows it.
const INVOICE_WINDOW_KEY = 'rivetdog_invoice_window'
const WINDOW_CHOICES = ['30', '90', '180', 'all', 'custom']

function loadWindowPref() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(INVOICE_WINDOW_KEY) || 'null')
    if (saved && WINDOW_CHOICES.includes(saved.choice)) return saved
  } catch { /* ignore */ }
  return { choice: 'all', from: '', to: '' }
}

function windowFromChoice({ choice, from, to }) {
  if (choice === 'all') return { windowFrom: null, windowTo: null }
  if (choice === 'custom') return { windowFrom: from || null, windowTo: to || null }
  const days = Number(choice)
  const d = new Date()
  d.setDate(d.getDate() - days)
  return { windowFrom: d.toISOString().slice(0, 10), windowTo: null }
}

export default function InvoiceListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { companyId, company } = useEffectiveCompany()
  const { invoices, loading, error, refetch } = useInvoices()
  const paidMap = useInvoicePaidMap(companyId)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [windowPref, setWindowPref] = useState(loadWindowPref)
  const { sortCol, sortAsc, handleSort } = useInvoiceSort(SORT_STORAGE_KEY)
  const [showImport, setShowImport] = useState(false)
  const [showDocImport, setShowDocImport] = useState(false)

  function updateWindowPref(next) {
    setWindowPref(next)
    try { sessionStorage.setItem(INVOICE_WINDOW_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const clientNameOf = (inv) => inv.projects?.clients?.display_name || ''

  // Range first: the status chips recount within the active range.
  const { windowFrom, windowTo } = windowFromChoice(windowPref)
  let ranged = invoices
  if (windowFrom) ranged = ranged.filter(inv => (inv.created_at || '').slice(0, 10) >= windowFrom)
  if (windowTo) ranged = ranged.filter(inv => (inv.created_at || '').slice(0, 10) <= windowTo)

  let filtered = ranged
  if (statusFilter !== 'all') filtered = filtered.filter(inv => inv.status === statusFilter)
  if (needsVerification) filtered = filtered.filter(inv => inv.import_source && !inv.reminders_verified_at)
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(inv =>
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.projects?.name?.toLowerCase().includes(q) ||
      inv.projects?.clients?.display_name?.toLowerCase().includes(q)
    )
  }

  const sortCtx = { paidMap, clientNameOf }
  const sorted = sortInvoiceRows(filtered, sortCol, sortAsc, sortCtx)

  const counts = {}
  for (const s of STATUS_FILTERS) {
    counts[s] = s === 'all' ? ranged.length : ranged.filter(inv => inv.status === s).length
  }

  // Exports take exactly the on-screen set: filtered and sorted.
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
            <h1 className={styles.title}>{t('invoices:list.title')}</h1>
            <p className={styles.subtitle}>{t('invoices:list.subtitle')}</p>
          </div>
          <div className={styles.headerActions}>
            <button className={`${styles.newBtn} ${styles.importBtn}`} onClick={() => handleExport('csv')}><Download size={16} /> {t('invoices:list.exportCsv')}</button>
            <button className={`${styles.newBtn} ${styles.importBtn}`} onClick={() => handleExport('xlsx')}><Download size={16} /> {t('invoices:list.exportExcel')}</button>
            <button className={`${styles.newBtn} ${styles.importBtn}`} onClick={() => setShowImport(true)}><Upload size={16} /> {t('invoices:import.button')}</button>
            <button className={`${styles.newBtn} ${styles.importBtn}`} onClick={() => setShowDocImport(true)}><FileScan size={16} /> {t('import:docs.button')}</button>
            <button className={styles.newBtn} onClick={() => navigate('/invoices/new')}><Plus size={16} /> {t('invoices:list.newInvoice')}</button>
          </div>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} />
            <input className={styles.searchInput} placeholder={t('invoices:list.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className={styles.filterRight}>
            <div className={styles.chips}>
              {STATUS_FILTERS.map(s => (
                <button key={s} className={`${styles.chip} ${statusFilter === s ? styles.chipActive : ''}`} onClick={() => setStatusFilter(s)}>
                  {t(`invoices:list.filter.${s}`)} ({counts[s]})
                </button>
              ))}
              <button
                className={`${styles.chip} ${needsVerification ? styles.chipActive : ''}`}
                onClick={() => setNeedsVerification(v => !v)}
              >{t('invoices:reminders.needsVerificationFilter', { count: ranged.filter(inv => inv.import_source && !inv.reminders_verified_at).length })}</button>
            </div>
            <select
              className={styles.sortSelect}
              value={windowPref.choice}
              onChange={e => updateWindowPref({ ...windowPref, choice: e.target.value })}
              aria-label={t('jobs:window.label')}
            >
              <option value="30">{t('jobs:window.days30')}</option>
              <option value="90">{t('jobs:window.days90')}</option>
              <option value="180">{t('jobs:window.days180')}</option>
              <option value="all">{t('jobs:window.all')}</option>
              <option value="custom">{t('jobs:window.custom')}</option>
            </select>
            {windowPref.choice === 'custom' && (
              <>
                <input
                  type="date"
                  className={styles.sortSelect}
                  value={windowPref.from}
                  onChange={e => updateWindowPref({ ...windowPref, from: e.target.value })}
                />
                <input
                  type="date"
                  className={styles.sortSelect}
                  value={windowPref.to}
                  onChange={e => updateWindowPref({ ...windowPref, to: e.target.value })}
                />
              </>
            )}
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {loading ? (
          <div className={styles.empty}>{t('common:misc.loading')}</div>
        ) : sorted.length === 0 && invoices.length === 0 ? (
          <div className={styles.emptyState}>
            <FileText size={48} />
            <h2>{t('invoices:list.emptyTitle')}</h2>
            <p>{t('invoices:list.emptyBody')}</p>
            <button className={styles.newBtn} onClick={() => navigate('/invoices/new')}><Plus size={16} /> {t('invoices:list.newInvoice')}</button>
          </div>
        ) : sorted.length === 0 ? (
          <div className={styles.empty}>{t('invoices:list.noMatch')}</div>
        ) : (
          <InvoiceTable
            rows={sorted}
            paidMap={paidMap}
            clientNameOf={clientNameOf}
            sortCol={sortCol}
            sortAsc={sortAsc}
            onSort={handleSort}
            onRowClick={inv => navigate(`/invoices/${inv.id}`)}
          />
        )}
      </main>

      {showImport && (
        <Modal title={t('invoices:import.title')} onClose={() => setShowImport(false)}>
          <InvoiceImportModal onClose={() => setShowImport(false)} onImported={refetch} />
        </Modal>
      )}

      {showDocImport && (
        <Modal title={t('import:docs.titleInvoices')} onClose={() => setShowDocImport(false)}>
          <DocumentImportModal entity="invoices" onClose={() => setShowDocImport(false)} onImported={refetch} />
        </Modal>
      )}
    </div>
  )
}
