import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { User, Star, Edit, Trash2, Plus } from 'lucide-react'
import ClientContactModal from './ClientContactModal'
import styles from './ClientContactsSection.module.css'

export default function ClientContactsSection({ clientId, contacts, clientName, addContact, updateContact, deleteContact, onChange }) {
  const { t } = useTranslation()
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
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
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
