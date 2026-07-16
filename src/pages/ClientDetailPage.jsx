import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Home, Building2, HardHat, Mail, Phone, Tag, FileText, Briefcase, Trash2, Edit, DollarSign, Clock } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import Modal from '../components/ui/Modal'
import ClientForm from '../components/clients/ClientForm'
import ClientLogoUpload from '../components/clients/ClientLogoUpload'
import ClientAddressEditor from '../components/clients/ClientAddressEditor'
import ClientContactsSection from '../components/clients/ClientContactsSection'
import ClientActivitySection from '../components/clients/ClientActivitySection'
import { useClient } from '../hooks/useClient'
import { useClients } from '../hooks/useClients'
import { timeAgo } from '../utils/timeAgo'
import styles from './ClientDetailPage.module.css'

const fmtCurrency = (val) => {
  if (val == null) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val))
}

export default function ClientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { client, contacts, projects, loading, error, refetch, addContact, updateContact, deleteContact } = useClient(id)
  const { updateClient, deleteClient } = useClients()
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleUpdate(payload, newContacts) {
    await updateClient(id, payload)
    setShowEdit(false)
    refetch()
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteClient(id)
      navigate('/clients')
    } catch (err) {
      alert('Failed to delete: ' + err.message)
      setDeleting(false)
    }
  }

  if (loading) return <div className={styles.page}><AppHeader /><main className={styles.main}><p className={styles.loading}>Loading…</p></main></div>
  if (error || !client) return <div className={styles.page}><AppHeader /><main className={styles.main}><p className={styles.loading}>Client not found.</p></main></div>

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <BackLink to="/clients" label="Clients" />

        {/* Header: logo + name + stats */}
        <div className={styles.topRow}>
          <div className={styles.topLeftRow}>
            <ClientLogoUpload
              clientId={id}
              currentLogoUrl={client.logo_url}
              clientName={client.display_name}
              onLogoChange={() => refetch()}
            />
            <div className={styles.topLeft}>
              <span className={styles.typeBadge}>
                {client.client_type === 'general_contractor'
                  ? <><HardHat size={14} /> general contractor</>
                  : client.client_type === 'commercial'
                    ? <><Building2 size={14} /> commercial</>
                    : <><Home size={14} /> residential</>}
              </span>
              <h1 className={styles.name}>{client.display_name}</h1>
              {client.business_name && <div className={styles.bizName}>{client.business_name}</div>}
              <div className={styles.statsStrip}>
                <span className={styles.stat}><DollarSign size={14} /> {fmtCurrency(client.lifetime_value)}</span>
                <span className={styles.statDot}>&middot;</span>
                <span className={styles.stat}><Clock size={14} /> {client.last_contact_at ? timeAgo(client.last_contact_at) : 'No activity yet'}</span>
              </div>
            </div>
          </div>
          <div className={styles.topActions}>
            <button className={styles.editBtn} onClick={() => setShowEdit(true)}><Edit size={14} /> Edit</button>
            <button className={styles.deleteBtn} onClick={() => setShowDelete(true)}><Trash2 size={14} /> Delete</button>
          </div>
        </div>

        {/* Contact Info */}
        <div className={styles.flatSection}>
          <h3 className={styles.flatLabel}>Contact Info</h3>
          <div className={styles.flatContent}>
            {client.primary_email && <div className={styles.infoRow}><Mail size={14} /> {client.primary_email}</div>}
            {client.primary_phone && <div className={styles.infoRow}><Phone size={14} /> {client.primary_phone}</div>}
            {client.preferred_contact_method && <div className={styles.infoRow}><span className={styles.label}>Preferred:</span> {client.preferred_contact_method}</div>}
            {client.billing_terms && <div className={styles.infoRow}><span className={styles.label}>Billing:</span> {client.billing_terms.replace(/_/g, ' ')}</div>}
          </div>
        </div>

        {/* Details */}
        <div className={styles.flatSection}>
          <h3 className={styles.flatLabel}>Details</h3>
          <div className={styles.flatContent}>
            {client.property_type && <div className={styles.infoRow}><span className={styles.label}>Property:</span> {client.property_type.replace(/_/g, ' ')}</div>}
            {client.tags?.length > 0 && <div className={styles.infoRow}><Tag size={14} /> {client.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}</div>}
            {client.company_website && <div className={styles.infoRow}><span className={styles.label}>Website:</span> <a href={client.company_website} target="_blank" rel="noopener noreferrer">{client.company_website}</a></div>}
            {client.notes && <div className={styles.infoRow}><FileText size={14} /> {client.notes}</div>}
          </div>
        </div>

        {/* Addresses — multi-address editor */}
        <ClientAddressEditor clientId={id} />

        {/* Contacts */}
        <ClientContactsSection
          clientId={id}
          contacts={contacts}
          clientName={client.display_name}
          addContact={addContact}
          updateContact={updateContact}
          deleteContact={deleteContact}
          onChange={() => refetch()}
        />

        {/* Activity */}
        <ClientActivitySection clientId={id} onChange={() => refetch()} />

        {/* Linked Jobs */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Jobs ({projects.length})</h2>
          {projects.length === 0 ? (
            <p className={styles.muted}>No jobs linked to this client.</p>
          ) : (
            <div className={styles.jobList}>
              {projects.map(p => (
                <div key={p.id} className={styles.jobRow} onClick={() => navigate(`/project/${p.id}`)}>
                  <Briefcase size={14} />
                  <span className={styles.jobName}>{p.name}</span>
                  <span className={styles.jobStatus}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showEdit && (
        <Modal title="Edit Client" onClose={() => setShowEdit(false)}>
          <ClientForm initialClient={client} initialContacts={contacts} onSubmit={handleUpdate} onCancel={() => setShowEdit(false)} />
        </Modal>
      )}

      {showDelete && (
        <Modal title="Delete Client?" onClose={() => setShowDelete(false)}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>This will permanently delete this client and all their contacts. Linked jobs will be unlinked but not deleted.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={{ padding: '9px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', cursor: 'pointer' }} onClick={() => setShowDelete(false)}>Cancel</button>
            <button style={{ padding: '9px 18px', background: 'var(--color-danger)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontWeight: 600, cursor: 'pointer' }} onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
