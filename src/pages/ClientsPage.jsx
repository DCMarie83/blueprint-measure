import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Home, Building2, Search, Plus } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import Modal from '../components/ui/Modal'
import ClientForm from '../components/clients/ClientForm'
import { useClients } from '../hooks/useClients'
import styles from './ClientsPage.module.css'

export default function ClientsPage() {
  const navigate = useNavigate()
  const { clients, loading, createClient } = useClients()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const filtered = clients.filter(c => {
    if (typeFilter !== 'all' && c.client_type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (c.display_name?.toLowerCase().includes(q) || c.business_name?.toLowerCase().includes(q) || c.primary_email?.toLowerCase().includes(q))
    }
    return true
  })

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
          <button className={styles.newBtn} onClick={() => setShowCreate(true)}><Plus size={16} /> New Client</button>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} />
            <input className={styles.searchInput} placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className={styles.chips}>
            {['all', 'residential', 'commercial'].map(t => (
              <button key={t} className={`${styles.chip} ${typeFilter === t ? styles.chipActive : ''}`} onClick={() => setTypeFilter(t)}>
                {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading…</div>
        ) : filtered.length === 0 && clients.length === 0 ? (
          <div className={styles.emptyState}>
            <Building2 size={48} />
            <h2>No clients yet</h2>
            <p>Add your first client to start managing contacts and linking jobs.</p>
            <button className={styles.newBtn} onClick={() => setShowCreate(true)}><Plus size={16} /> Add your first client</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>No clients match your search.</div>
        ) : (
          <div className={styles.grid}>
            {filtered.map(client => (
              <div key={client.id} className={styles.card} onClick={() => navigate(`/clients/${client.id}`)}>
                <div className={styles.cardIcon}>
                  {client.client_type === 'commercial' ? <Building2 size={20} /> : <Home size={20} />}
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardName}>{client.display_name}</h3>
                  {client.business_name && client.client_type === 'commercial' && (
                    <div className={styles.cardBiz}>{client.business_name}</div>
                  )}
                  <div className={styles.cardMeta}>
                    {client.primary_email && <span>{client.primary_email}</span>}
                    {client.primary_phone && <span>{client.primary_phone}</span>}
                  </div>
                  <div className={styles.cardFooter}>
                    {client.property_type && <span className={styles.badge}>{client.property_type.replace(/_/g, ' ')}</span>}
                    {(client.client_contacts?.length ?? 0) > 0 && (
                      <span className={styles.badge}>{client.client_contacts.length} contact{client.client_contacts.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <Modal title="New Client" onClose={() => setShowCreate(false)}>
          <ClientForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}
    </div>
  )
}
