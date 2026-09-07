import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { User, Star, Edit, Trash2, Plus, Copy, Check, MessageSquare } from 'lucide-react'
import ClientContactModal from './ClientContactModal'
import { useUserPrefs } from '../../hooks/useUserPrefs'
import { buildEmailLink, emailLinkTarget } from '../../lib/emailLink'
import styles from './ClientContactsSection.module.css'

// Small copy affordance for a phone or email value.
function CopyBtn({ value, title }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch { /* clipboard unavailable */ }
      }}
      title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--color-success)' : 'var(--color-text-muted)', padding: 2, display: 'inline-flex', alignItems: 'center' }}
    >{copied ? <Check size={12} /> : <Copy size={12} />}</button>
  )
}

export default function ClientContactsSection({ clientId, contacts, clientName, addContact, updateContact, deleteContact, onChange }) {
  const { t } = useTranslation()
  const prefs = useUserPrefs()
  const [modalContact, setModalContact] = useState(undefined) // undefined=closed, null=new, object=edit
  const [deleting, setDeleting] = useState(null)

  async function handleSave(contactId, payload) {
    if (contactId) {
      await updateContact(contactId, payload)
    } else {
      await addContact(payload)
    }
    onChange?.()
  }

  async function handleDelete(contact) {
    if (!window.confirm(t('clients:contact.confirmRemove'))) return
    setDeleting(contact.id)
    try {
      await deleteContact(contact.id)
      onChange?.()
    } catch (err) {
      alert(t('clients:errors.deleteFailed', { error: err.message }))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('clients:contact.sectionTitle', { count: contacts.length })}</h2>
        <button className={styles.addBtn} onClick={() => setModalContact(null)}>
          <Plus size={14} /> {t('clients:contact.addContact')}
        </button>
      </div>

      {contacts.length === 0 ? (
        <div className={styles.empty}>
          <User size={20} />
          <span>{t('clients:contact.empty', { name: clientName || t('clients:contact.thisClient') })}</span>
        </div>
      ) : (
        <div className={styles.list}>
          {contacts.map(c => (
            <div key={c.id} className={styles.card}>
              <div className={styles.cardIcon}><User size={18} /></div>
              <div className={styles.cardBody}>
                <div className={styles.cardTopRow}>
                  <div className={styles.cardNameRow}>
                    <strong>{c.name}</strong>
                    {c.title && <span className={styles.muted}> — {c.title}</span>}
                  </div>
                  <div className={styles.badges}>
                    {c.is_primary && <span className={styles.primaryBadge}><Star size={10} /> {t('clients:contact.primary')}</span>}
                    {c.is_portal_recipient && <span className={styles.portalBadge}>{t('clients:contact.portal')}</span>}
                  </div>
                </div>
                <div className={styles.cardMeta}>
                  {c.email && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <a href={buildEmailLink(prefs, c.email)} target={emailLinkTarget(prefs)} rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>{c.email}</a>
                      <CopyBtn value={c.email} title={t('clients:contact.copyEmail')} />
                    </span>
                  )}
                  {c.phone && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <a href={`tel:${c.phone}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>{c.phone}</a>
                      <CopyBtn value={c.phone} title={t('clients:contact.copyPhone')} />
                      <a href={`sms:${c.phone}`} title={t('clients:contact.textAction')} style={{ color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center' }}><MessageSquare size={12} /></a>
                    </span>
                  )}
                </div>
                {c.notes && <div className={styles.cardNotes}>{c.notes}</div>}
              </div>
              <div className={styles.cardActions}>
                <button className={styles.iconBtn} onClick={() => setModalContact(c)} title={t('common:action.edit')}><Edit size={14} /></button>
                <button className={styles.iconBtn} onClick={() => handleDelete(c)} disabled={deleting === c.id} title={t('common:action.delete')}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalContact !== undefined && (
        <ClientContactModal
          contact={modalContact}
          onClose={() => setModalContact(undefined)}
          onSave={handleSave}
        />
      )}
    </section>
  )
}
