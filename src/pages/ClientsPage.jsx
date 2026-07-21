import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PawPrint, Search, Plus, Upload, X } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import Modal from '../components/ui/Modal'
import ClientForm from '../components/clients/ClientForm'
import ClientImportModal from '../components/clients/ClientImportModal'
import ClientListView from '../components/clients/ClientListView'
import { useClients } from '../hooks/useClients'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import { trackMaterials } from '../lib/analytics'
import { CLIENT_STATUSES, statusMeta } from '../lib/clientsView'
import '../components/clients/clientsView.css'
import styles from './ClientsPage.module.css'

const DEFAULT_DIR = { name: 'asc', status: 'asc', last_contact: 'desc', lifetime_value: 'desc' }

function sortClients(list, key, dir) {
  const s = [...list]
  const mul = dir === 'asc' ? 1 : -1
  s.sort((a, b) => {
    switch (key) {
      case 'name': return mul * (a.display_name ?? '').localeCompare(b.display_name ?? '')
      case 'status': return mul * (a.status ?? '').localeCompare(b.status ?? '')
      case 'lifetime_value': return mul * ((Number(a.lifetime_value) || 0) - (Number(b.lifetime_value) || 0))
      case 'last_contact':
      default: {
        const at = a.last_contact_at ? new Date(a.last_contact_at).getTime() : 0
        const bt = b.last_contact_at ? new Date(b.last_contact_at).getTime() : 0
        return mul * (at - bt)
      }
    }
  })
  return s
}

const chipBtn = (active) => ({
  padding: '5px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: active ? '1px solid #F27243' : '1px solid var(--color-border)',
  background: active ? '#F27243' : 'var(--color-surface)',
  color: active ? '#fff' : 'var(--color-text, #1b2426)',
})

function SkeletonRows() {
  const bar = (w) => <span className="cv-shimmer" style={{ display: 'inline-block', height: 12, width: w }} />
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', overflow: 'hidden' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--color-border)' }}>
          <span className="cv-shimmer" style={{ width: 34, height: 34, borderRadius: '50%' }} />
          <span style={{ flex: 2 }}>{bar('60%')}</span>
          <span style={{ flex: 1 }}>{bar('50%')}</span>
          <span style={{ flex: 1 }}>{bar('70%')}</span>
          <span style={{ flex: 1 }}>{bar('40%')}</span>
          <span style={{ flex: 1 }}>{bar('30%')}</span>
        </div>
      ))}
    </div>
  )
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const { clients, loading, error, createClient, refetch } = useClients()
  const { companyId } = useEffectiveCompany()

  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('last_contact')
  const [sortDir, setSortDir] = useState('desc')
  const [errorDismissed, setErrorDismissed] = useState(false)
  const [pickerClient, setPickerClient] = useState(null)
  const [notice, setNotice] = useState(null)

  // Debounce the search input (300ms).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [search])

  const counts = useMemo(() => {
    const c = { all: clients.length, lead: 0, active: 0, past: 0, do_not_contact: 0 }
    for (const cl of clients) c[cl.status] = (c[cl.status] ?? 0) + 1
    return c
  }, [clients])

  const filtered = useMemo(() => clients.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (debounced) {
      return (
        c.display_name?.toLowerCase().includes(debounced) ||
        c.business_name?.toLowerCase().includes(debounced) ||
        c.primary_email?.toLowerCase().includes(debounced) ||
        c.primary_phone?.toLowerCase().includes(debounced)
      )
    }
    return true
  }), [clients, statusFilter, debounced])

  const sorted = useMemo(() => sortClients(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  function onSort(key) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(DEFAULT_DIR[key] || 'asc') }
  }

  function trackClient(client, action) {
    trackMaterials('client_quick_action', { companyId, entityType: 'client', entityId: client.id, action, surface: 'clients' })
  }

  function handleNewEstimate(client) {
    trackClient(client, 'new_estimate')
    const projs = client.project_list ?? []
    if (projs.length === 1) navigate(`/project/${projs[0].id}`)
    else if (projs.length > 1) setPickerClient(client)
    else {
      setNotice(`Start a job for ${client.display_name} first, then bid it.`)
      setTimeout(() => navigate('/jobs'), 1400)
    }
  }

  function handleNewJob(client) {
    trackClient(client, 'new_job')
    navigate('/jobs')
  }

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

        {notice && (
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F27243', marginBottom: 12 }}>{notice}</div>
        )}

        {/* Search + status chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              placeholder="Search clients…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 32px', fontSize: 14, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg, #fff)', color: 'var(--color-text)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={chipBtn(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>All {counts.all}</button>
            {CLIENT_STATUSES.map(s => (
              <button key={s} style={chipBtn(statusFilter === s)} onClick={() => setStatusFilter(s)}>
                {statusMeta(s).label} {counts[s] ?? 0}
              </button>
            ))}
          </div>
        </div>

        {error && !errorDismissed && (
          <div className={styles.errorBanner}>
            <span>Failed to load clients: {error}</span>
            <button className={styles.errorDismiss} onClick={() => setErrorDismissed(true)}><X size={14} /></button>
          </div>
        )}

        {loading ? (
          <SkeletonRows />
        ) : clients.length === 0 ? (
          <div className={styles.emptyState}>
            <PawPrint size={48} />
            <h2>No clients yet.</h2>
            <p>Add your first client or import your book of business.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className={styles.newBtn} onClick={() => setShowCreate(true)}><Plus size={16} /> Add Client</button>
              <button className={`${styles.newBtn} ${styles.importBtn}`} onClick={() => setShowImport(true)}><Upload size={16} /> Import</button>
            </div>
          </div>
        ) : sorted.length === 0 ? (
          <div className={styles.empty}>No clients match {search}.</div>
        ) : (
          <ClientListView
            clients={sorted}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onRowClick={(c) => navigate(`/clients/${c.id}`)}
            onNewEstimate={handleNewEstimate}
            onNewJob={handleNewJob}
            onQuickTrack={trackClient}
          />
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

      {pickerClient && (
        <Modal title={`Which job for ${pickerClient.display_name}?`} onClose={() => setPickerClient(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
            {(pickerClient.project_list ?? []).map(p => (
              <button
                key={p.id}
                onClick={() => { setPickerClient(null); navigate(`/project/${p.id}`) }}
                style={{ textAlign: 'left', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 600, color: 'var(--color-text, #1b2426)' }}
              >
                {p.name || 'Untitled job'}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
