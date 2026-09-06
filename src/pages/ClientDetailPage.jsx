import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { Home, Building2, HardHat, Mail, Phone, FileText, Briefcase, Trash2, Edit, DollarSign, Clock, Tag, Globe, ChevronDown, ChevronRight } from 'lucide-react'
import BackLink from '../components/BackLink'
import Modal from '../components/ui/Modal'
import ClientForm from '../components/clients/ClientForm'
import ClientLogoUpload from '../components/clients/ClientLogoUpload'
import ClientAddressEditor from '../components/clients/ClientAddressEditor'
import ClientContactsSection from '../components/clients/ClientContactsSection'
import ClientActivitySection from '../components/clients/ClientActivitySection'
import DocumentsSection from '../components/documents/DocumentsSection'
import InvoiceStatusBadge from '../components/invoices/InvoiceStatusBadge'
import { getDisplayTotal } from '../lib/estimateDisplay'
import { isOverdue } from '../hooks/useInvoices'
import { useClient } from '../hooks/useClient'
import { useClients } from '../hooks/useClients'
import { useSessionCollapse } from '../hooks/useSessionCollapse'
import { useEffectiveCompany } from '../hooks/useEffectiveCompany'
import { supabase } from '../lib/supabase'
import { trackMaterials } from '../lib/analytics'
import { timeAgo } from '../utils/timeAgo'
import { statusMeta, initials, fmtMoneyFlat, AVATAR_GRADIENT, CLIENT_STATUSES } from '../lib/clientsView'
import '../components/clients/clientsView.css'
import styles from './ClientDetailPage.module.css'

// Count-up for the lifetime-value stat, display-only, reduced-motion aware.
function useCountUp(value, duration = 500) {
  const [n, setN] = useState(Number(value) || 0)
  const fromRef = useRef(Number(value) || 0)
  const raf = useRef(null)
  useEffect(() => {
    const target = Number(value) || 0
    const from = Number(fromRef.current) || 0
    if (from === target) { setN(target); return }
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { fromRef.current = target; setN(target); return }
    let start = null
    const step = (ts) => {
      if (start == null) start = ts
      const p = Math.min(1, (ts - start) / duration)
      const e = 1 - Math.pow(1 - p, 3)
      setN(from + (target - from) * e)
      if (p < 1) raf.current = requestAnimationFrame(step)
      else fromRef.current = target
    }
    raf.current = requestAnimationFrame(step)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, duration])
  return n
}

// G57: collapsible section shell — count in the header, collapsed by default
// past 8 rows, state remembered for the session.
function CollapsibleSection({ collapseKey, title, rowCount, className, titleClassName, children }) {
  const [collapsed, setCollapsed] = useSessionCollapse(collapseKey, rowCount > 8)
  return (
    <section className={className}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left' }}
      >
        {collapsed ? <ChevronRight size={15} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--color-text-muted)' }} />}
        <h2 className={titleClassName} style={{ margin: 0 }}>{title}</h2>
      </button>
      {!collapsed && <div style={{ marginTop: 10 }}>{children}</div>}
    </section>
  )
}

const statCard = { flex: '1 1 160px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: '14px 16px' }
const statLabel = { fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }
const statValue = { fontSize: 20, fontWeight: 800, color: 'var(--color-text, #1b2426)', fontVariantNumeric: 'tabular-nums' }
const actionBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }

export default function ClientDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { client, contacts, projects, invoices, estimates, documents, loading, error, refetch, addContact, updateContact, deleteContact } = useClient(id)
  const { deleteClient } = useClients()
  const { companyId } = useEffectiveCompany()
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [notice, setNotice] = useState(null)

  const ltv = useCountUp(Number(client?.lifetime_value) || 0)

  function track(action) {
    trackMaterials('client_quick_action', { companyId, entityType: 'client', entityId: id, action, surface: 'clients' })
  }

  async function handleUpdate(payload) {
    const { error: err } = await supabase
      .from('clients')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) { alert(t('clients:detail.saveFailed', { error: err.message })); return }
    setShowEdit(false)
    refetch()
  }

  async function handleStatusChange(next) {
    if (!client || next === client.status) return
    const { error: err } = await supabase
      .from('clients')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (err) { alert(t('clients:detail.statusUpdateFailed', { error: err.message })); return }
    trackMaterials('client_status_changed', { companyId, entityType: 'client', entityId: id, status: next, surface: 'clients' })
    refetch()
  }

  function handleNewEstimate() {
    track('new_estimate')
    const projs = projects ?? []
    if (projs.length === 1) navigate(`/project/${projs[0].id}`)
    else if (projs.length > 1) setPickerOpen(true)
    else { setNotice(t('clients:list.startJobFirst', { name: client.display_name })); setTimeout(() => navigate('/jobs'), 1400) }
  }

  function handleNewJob() {
    track('new_job')
    navigate('/jobs')
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteClient(id)
      navigate('/clients')
    } catch (err) {
      alert(t('clients:errors.deleteFailed', { error: err.message }))
      setDeleting(false)
    }
  }

  if (loading) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>{t('common:misc.loading')}</p></main></div>
  if (error || !client) return <div className={styles.page}><main className={styles.main}><p className={styles.loading}>{t('clients:detail.notFound')}</p></main></div>

  const chip = statusMeta(client.status)

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <BackLink to="/clients" label={t('clients:list.title')} />

        {notice && <div style={{ fontSize: 13, fontWeight: 600, color: '#F27243', margin: '8px 0' }}>{notice}</div>}

        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between', margin: '12px 0 20px' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: AVATAR_GRADIENT, color: '#fff', fontSize: 18, fontWeight: 700 }}>
              {client.logo_url ? <img src={client.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(client.display_name)}
            </span>
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                {client.client_type === 'general_contractor' ? <><HardHat size={14} /> {t('clients:detail.typeGeneralContractor')}</>
                  : client.client_type === 'commercial' ? <><Building2 size={14} /> {t('clients:detail.typeCommercial')}</>
                  : <><Home size={14} /> {t('clients:detail.typeResidential')}</>}
              </span>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: '2px 0 0', color: 'var(--color-text, #1b2426)' }}>{client.display_name}</h1>
              <div className="cv-underline" />
              {client.business_name && <div style={{ color: 'var(--color-text-muted)', marginTop: 6 }}>{client.business_name}</div>}
              {/* Inline status changer */}
              <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700, background: chip.bg, color: chip.fg }}>{t(chip.label)}</span>
                <select
                  value={client.status}
                  onChange={e => handleStatusChange(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                >
                  {CLIENT_STATUSES.map(s => <option key={s} value={s}>{t(statusMeta(s).label)}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ClientLogoUpload clientId={id} currentLogoUrl={client.logo_url} clientName={client.display_name} onLogoChange={() => refetch()} />
            <button style={actionBtn} onClick={() => setShowEdit(true)}><Edit size={14} /> {t('common:action.edit')}</button>
            <button style={{ ...actionBtn, color: 'var(--color-danger, #dc2626)' }} onClick={() => setShowDelete(true)}><Trash2 size={14} /> {t('common:action.delete')}</button>
          </div>
        </div>

        {/* Pinned quick actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {client.primary_phone && <a style={actionBtn} href={`tel:${client.primary_phone}`} onClick={() => track('call')}><Phone size={14} /> {t('clients:detail.call')}</a>}
          {client.primary_email && <a style={actionBtn} href={`mailto:${client.primary_email}`} onClick={() => track('email')}><Mail size={14} /> {t('clients:detail.email')}</a>}
          <button style={actionBtn} onClick={handleNewEstimate}><FileText size={14} /> {t('clients:detail.newEstimate')}</button>
          <button style={actionBtn} onClick={handleNewJob}><Briefcase size={14} /> {t('clients:detail.newJob')}</button>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <div style={statCard}>
            <div style={statLabel}><DollarSign size={14} /> {t('clients:detail.lifetimeValue')}</div>
            <div style={statValue}>{fmtMoneyFlat(ltv)}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}><Briefcase size={14} /> {t('clients:detail.projects')}</div>
            <div style={statValue}>{projects.length}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}><Clock size={14} /> {t('clients:detail.lastContact')}</div>
            <div style={{ ...statValue, fontSize: 16 }}>{client.last_contact_at ? timeAgo(client.last_contact_at) : t('clients:list.never')}</div>
          </div>
        </div>

        {/* Details (data that isn't in quick actions) */}
        {(client.preferred_contact_method || client.billing_terms || client.property_type || client.company_website || client.notes || client.tags?.length > 0) && (
          <div className={styles.flatSection}>
            <h3 className={styles.flatLabel}>{t('clients:detail.detailsTitle')}</h3>
            <div className={styles.flatContent}>
              {client.preferred_contact_method && <div className={styles.infoRow}><span className={styles.label}>{t('clients:detail.preferredLabel')}</span> {client.preferred_contact_method}</div>}
              {client.billing_terms && <div className={styles.infoRow}><span className={styles.label}>{t('clients:detail.billingLabel')}</span> {client.billing_terms.replace(/_/g, ' ')}</div>}
              {client.property_type && <div className={styles.infoRow}><span className={styles.label}>{t('clients:detail.propertyLabel')}</span> {client.property_type.replace(/_/g, ' ')}</div>}
              {client.company_website && <div className={styles.infoRow}><Globe size={14} /> <a href={client.company_website} target="_blank" rel="noopener noreferrer">{client.company_website}</a></div>}
              {client.tags?.length > 0 && <div className={styles.infoRow}><Tag size={14} /> {client.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}</div>}
              {client.notes && <div className={styles.infoRow}><FileText size={14} /> {client.notes}</div>}
            </div>
          </div>
        )}

        {/* Projects */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('clients:detail.projectsCount', { count: projects.length })}</h2>
          {projects.length === 0 ? (
            <p className={styles.muted}>{t('clients:detail.noJobs')}</p>
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

        {/* Invoices — FK union: invoices.client_id OR the client's projects */}
        <CollapsibleSection
          collapseKey={`client_${id}_invoices`}
          rowCount={invoices.length}
          title={t('clients:detail.invoicesCount', { count: invoices.length })}
          className={styles.section}
          titleClassName={styles.sectionTitle}
        >
          {invoices.length === 0 ? (
            <p className={styles.muted}>{t('clients:detail.noInvoices')}</p>
          ) : (
            <div className={styles.jobList}>
              {invoices.map(inv => (
                <div key={inv.id} className={styles.jobRow} onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <FileText size={14} />
                  <span className={styles.jobName}>{inv.invoice_number}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ''}
                  </span>
                  <InvoiceStatusBadge status={inv.status} isOverdue={isOverdue(inv)} />
                  <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fmtMoneyFlat(Number(inv.total) || 0)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {t('clients:detail.paidAmount', { amount: fmtMoneyFlat(Number(inv.paid_amount) || 0) })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Estimates — via the client's projects (estimates carry no client_id) */}
        <CollapsibleSection
          collapseKey={`client_${id}_estimates`}
          rowCount={estimates.length}
          title={t('clients:detail.estimatesCount', { count: estimates.length })}
          className={styles.section}
          titleClassName={styles.sectionTitle}
        >
          {estimates.length === 0 ? (
            <p className={styles.muted}>{t('clients:detail.noEstimates')}</p>
          ) : (
            <div className={styles.jobList}>
              {estimates.map(est => (
                <div key={est.id} className={styles.jobRow} onClick={() => navigate(`/estimates/${est.id}`)}>
                  <FileText size={14} />
                  <span className={styles.jobName}>{est.title || est.estimate_number}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {est.created_at ? new Date(est.created_at).toLocaleDateString() : ''}
                  </span>
                  <span className={styles.jobStatus}>{est.status}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fmtMoneyFlat(Number(getDisplayTotal(est)) || 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Documents: linked to this client or its records + direct attach (G54) */}
        <DocumentsSection documents={documents} collapsible collapseKey={`client_${id}_documents`} uploadTarget={{ type: 'client', id }} onUploaded={refetch} />

        {/* Recent activity (entries deep-link to the most specific real surface) */}
        <ClientActivitySection clientId={id} onChange={() => refetch()} />

        {/* Addresses */}
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
      </main>

      {showEdit && (
        <Modal title={t('clients:detail.editClient')} onClose={() => setShowEdit(false)}>
          <ClientForm initialClient={client} initialContacts={contacts} onSubmit={handleUpdate} onCancel={() => setShowEdit(false)} />
        </Modal>
      )}

      {showDelete && (
        <Modal title={t('clients:detail.deleteClientTitle')} onClose={() => setShowDelete(false)}>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>{t('clients:detail.deleteWarning')}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={{ padding: '9px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', cursor: 'pointer' }} onClick={() => setShowDelete(false)}>{t('common:action.cancel')}</button>
            <button style={{ padding: '9px 18px', background: 'var(--color-danger)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontWeight: 600, cursor: 'pointer' }} onClick={handleDelete} disabled={deleting}>{deleting ? t('clients:detail.deleting') : t('common:action.delete')}</button>
          </div>
        </Modal>
      )}

      {pickerOpen && (
        <Modal title={t('clients:list.whichJob', { name: client.display_name })} onClose={() => setPickerOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
            {projects.map(p => (
              <button key={p.id} onClick={() => { setPickerOpen(false); navigate(`/project/${p.id}`) }}
                style={{ textAlign: 'left', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', cursor: 'pointer', fontWeight: 600, color: 'var(--color-text, #1b2426)' }}>
                {p.name || t('clients:list.untitledJob')}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
