import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Search, Plus, Upload, X } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import Modal from '../components/ui/Modal'
import ClientForm from '../components/clients/ClientForm'
import ClientImportModal from '../components/clients/ClientImportModal'
import ClientListView from '../components/clients/ClientListView'
import ClientSortDropdown from '../components/clients/ClientSortDropdown'
import { useClients } from '../hooks/useClients'
import styles from './ClientsPage.module.css'

function sortClients(clients, key) {
  const copy = [...clients]
  switch (key) {
    case 'name_az':
      return copy.sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? ''))
    case 'lifetime_value':
      return copy.sort((a, b) => (Number(b.lifetime_value) || 0) - (Number(a.lifetime_value) || 0))
    case 'last_contact':
      return copy.sort((a, b) => {
        const at = a.last_contact_at ? new Date(a.last_contact_at).getTime() : 0
        const bt = b.last_contact_at ? new Date(b.last_contact_at).getTime() : 0
        return bt - at
      })
    case 'recent_activity':
    default:
      return copy.sort((a, b) => {
        const at = new Date(a.last_contact_at || a.updated_at || 0).getTime()
        const bt = new Date(b.last_contact_at || b.updated_at || 0).getTime()
        return bt - at
      })
  }
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const { clients, loading, error, createClient, refetch } = useClients()
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortKey, setSortKey] = useState('recent_activity')
  const [errorDismissed, setErrorDismissed] = useState(false)

  const filtered = clients.filter(c => {
    if (typeFilter !== 'all' && c.client_type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (c.display_name?.toLowerCase().includes(q) || c.business_name?.toLowerCase().includes(q) || c.primary_email?.toLowerCase().includes(q))
    }
    return true
  })

  const sorted = sortClients(filtered, sortKey)

  async function handleCreate(payload, contacts) {
    await createClient(payload, contacts)
    setShowCreate(false)
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Clients</h1>
            <p className={styles.subtitle}>Manage your residential and commercial clients</p>
          </div>
          <div className={styles.headerActions}>
            <button className={`${styles.newBtn} ${styles.importBtn}`} onClick={() => setShowImport(true)}><Upload size={16} /> Import</button>
            <button className={styles.newBtn} onClick={() => setShowCreate(true)}><Plus size={16} /> New Client</button>
          </div>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} />
            <input className={styles.searchInput} placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className={styles.filterRight}>
            <div className={styles.chips}>
              {['all', 'residential', 'commercial'].map(t => (
                <button key={t} className={`${styles.chip} ${typeFilter === t ? styles.chipActive : ''}`} onClick={() => setTypeFilter(t)}>
                  {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <ClientSortDropdown value={sortKey} onChange={setSortKey} />
          </div>
        </div>

        {error && !errorDismissed && (
          <div className={styles.errorBanner}>
            <span>Failed to load clients: {error}</span>
            <button className={styles.errorDismiss} onClick={() => setErrorDismissed(true)}><X size={14} /></button>
          </div>
        )}

        {loading ? (
          <div className={styles.empty}>Loading…</div>
        ) : sorted.length === 0 && clients.length === 0 ? (
          <div className={styles.emptyState}>
            <Building2 size={48} />
            <h2>Pack is empty — no clients yet.</h2>
            <p>Add your first client to start managing contacts and linking jobs.</p>
            <button className={styles.newBtn} onClick={() => setShowCreate(true)}><Plus size={16} /> Add your first client</button>
          </div>
        ) : sorted.length === 0 ? (
          <div className={styles.empty}>No clients match your search.</div>
        ) : (
          <ClientListView clients={sorted} onClickClient={(id) => navigate(`/clients/${id}`)} />
        )}
      </main>

      {showCreate && (
        <Modal title="New Client" onClose={() => setShowCreate(false)}>
          <ClientForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}

      {showImport && (
        <Modal title="Import Clients" onClose={() => setShowImport(false)}>
          <ClientImportModal onClose={() => setShowImport(false)} onImported={refetch} />
        </Modal>
      )}
    </div>
  )
}
