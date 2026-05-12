import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Home, Building2, Mail, Phone, MapPin, Tag, FileText, Briefcase, Trash2, Edit, User } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import Modal from '../components/ui/Modal'
import ClientForm from '../components/clients/ClientForm'
import { useClient } from '../hooks/useClient'
import { useClients } from '../hooks/useClients'
import styles from './ClientDetailPage.module.css'

export default function ClientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { client, contacts, projects, loading, error, refetch } = useClient(id)
  const { updateClient, deleteClient } = useClients()
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleUpdate(payload, newContacts) {
    await updateClient(id, payload)
    // TODO: contact updates in V2 — for now just update the client row
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

  const addr = client.property_address
  const addrStr = addr ? [addr.street, addr.unit, addr.city, addr.state, addr.zip].filter(Boolean).join(', ') : null
  const billAddr = client.billing_address
  const billStr = billAddr ? [billAddr.street, billAddr.unit, billAddr.city, billAddr.state, billAddr.zip].filter(Boolean).join(', ') : null

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <BackLink to="/clients" label="Clients" />
        <div className={styles.topRow}>
          <div className={styles.topLeft}>
            <span className={styles.typeBadge}>{client.client_type === 'commercial' ? <Building2 size={14} /> : <Home size={14} />} {client.client_type}</span>
            <h1 className={styles.name}>{client.display_name}</h1>
            {client.business_name && <div className={styles.bizName}>{client.business_name}</div>}
          </div>
          <div className={styles.topActions}>
            <button className={styles.editBtn} onClick={() => setShowEdit(true)}><Edit size={14} /> Edit</button>
            <button className={styles.deleteBtn} onClick={() => setShowDelete(true)}><Trash2 size={14} /> Delete</button>
          </div>
        </div>

        <div className={styles.cards}>
          <div className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Contact Info</h3>
            {client.primary_email && <div className={styles.infoRow}><Mail size={14} /> {client.primary_email}</div>}
            {client.primary_phone && <div className={styles.infoRow}><Phone size={14} /> {client.primary_phone}</div>}
            {client.preferred_contact_method && <div className={styles.infoRow}><span className={styles.label}>Preferred:</span> {client.preferred_contact_method}</div>}
            {client.billing_terms && <div className={styles.infoRow}><span className={styles.label}>Billing:</span> {client.billing_terms.replace(/_/g, ' ')}</div>}
          </div>

          <div className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Addresses</h3>
            {addrStr && <div className={styles.infoRow}><MapPin size={14} /> {addrStr}</div>}
            {billStr && <div className={styles.infoRow}><MapPin size={14} /> <span className={styles.label}>Billing:</span> {billStr}</div>}
            {!addrStr && !billStr && <div className={styles.muted}>No addresses set</div>}
          </div>

          <div className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Details</h3>
            {client.property_type && <div className={styles.infoRow}><span className={styles.label}>Property:</span> {client.property_type.replace(/_/g, ' ')}</div>}
            {client.tags?.length > 0 && <div className={styles.infoRow}><Tag size={14} /> {client.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}</div>}
            {client.company_website && <div className={styles.infoRow}><span className={styles.label}>Website:</span> <a href={client.company_website} target="_blank" rel="noopener noreferrer">{client.company_website}</a></div>}
            {client.notes && <div className={styles.infoRow}><FileText size={14} /> {client.notes}</div>}
          </div>
        </div>

        {/* Contacts */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Contacts ({contacts.length})</h2>
          {contacts.length === 0 ? (
            <div className={styles.contactEmpty}>
              <User size={20} />
              <span>No additional contacts. We'll communicate with {client.display_name} directly using the primary contact info above.</span>
            </div>
          ) : (
            <div className={styles.contactList}>
              {contacts.map(c => (
                <div key={c.id} className={styles.contactRow}>
                  <div><strong>{c.name}</strong>{c.title && <span className={styles.muted}> — {c.title}</span>}</div>
                  <div className={styles.contactMeta}>
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                    {c.is_primary && <span className={styles.primaryBadge}>Primary</span>}
                    {c.is_portal_recipient && <span className={styles.portalBadge}>Portal</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

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
