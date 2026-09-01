import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Search, Plus, Upload, FileScan } from 'lucide-react'
import Modal from '../components/ui/Modal'
import InvoiceStatusBadge from '../components/invoices/InvoiceStatusBadge'
import InvoiceImportModal from '../components/invoices/InvoiceImportModal'
import DocumentImportModal from '../components/import/DocumentImportModal'
import { useInvoices, isOverdue } from '../hooks/useInvoices'
import { timeAgo } from '../utils/timeAgo'
import styles from './InvoiceListPage.module.css'

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_FILTERS = ['all', 'draft', 'sent', 'partial', 'paid', 'void']
const SORT_OPTIONS = [
  { value: 'recent', label: 'invoices:list.sort.recent' },
  { value: 'due_date', label: 'invoices:list.sort.dueDate' },
  { value: 'total', label: 'invoices:list.sort.total' },
]

export default function InvoiceListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { invoices, loading, error, refetch } = useInvoices()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('recent')
  const [showImport, setShowImport] = useState(false)
  const [showDocImport, setShowDocImport] = useState(false)

  let filtered = invoices
  if (statusFilter !== 'all') filtered = filtered.filter(inv => inv.status === statusFilter)
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(inv =>
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.projects?.name?.toLowerCase().includes(q) ||
      inv.projects?.clients?.display_name?.toLowerCase().includes(q)
    )
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'due_date') {
      const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity
      const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity
      return ad - bd
    }
    if (sortKey === 'total') return (Number(b.total) || 0) - (Number(a.total) || 0)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const counts = {}
  for (const s of STATUS_FILTERS) {
    counts[s] = s === 'all' ? invoices.length : invoices.filter(inv => inv.status === s).length
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
            </div>
            <select className={styles.sortSelect} value={sortKey} onChange={e => setSortKey(e.target.value)}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
            </select>
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
          <div className={styles.list}>
            {sorted.map(inv => {
              const clientName = inv.projects?.clients?.display_name || '—'
              const projectName = inv.projects?.name || '—'
              return (
                <div key={inv.id} className={styles.row} onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowNumber}>{inv.invoice_number}</span>
                    <span className={styles.rowClient}>{clientName}</span>
                    <span className={styles.rowProject}>{projectName}</span>
                  </div>
                  <div className={styles.rowRight}>
                    <span className={styles.rowTotal}>{fmtMoney(inv.total)}</span>
                    <span className={styles.rowDue}>{inv.due_date ? fmtDate(inv.due_date) : '—'}</span>
                    <InvoiceStatusBadge status={inv.status} isOverdue={isOverdue(inv)} />
                    <span className={styles.rowCreated}>{timeAgo(inv.created_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
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
