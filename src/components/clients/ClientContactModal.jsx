import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import styles from './ClientContactModal.module.css'

export default function ClientContactModal({ contact, onClose, onSave }) {
  const { t } = useTranslation()
  const isEdit = !!contact
  const [form, setForm] = useState({
    name: contact?.name ?? '',
    title: contact?.title ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    is_primary: contact?.is_primary ?? false,
    is_portal_recipient: contact?.is_portal_recipient ?? false,
    notes: contact?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError(t('clients:contact.nameRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        is_primary: form.is_primary,
        is_portal_recipient: form.is_portal_recipient,
        notes: form.notes.trim() || null,
      }
      await onSave(contact?.id ?? null, payload)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? t('clients:contact.editContact') : t('clients:contact.addContact')} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:contact.name')}</span>
          <input className={styles.input} value={form.name} onChange={e => update('name', e.target.value)} required />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:contact.title')} <span className={styles.optional}>{t('clients:modal.optional')}</span></span>
          <input className={styles.input} value={form.title} onChange={e => update('title', e.target.value)} placeholder={t('clients:contact.titlePlaceholder')} />
        </label>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>{t('clients:contact.email')} <span className={styles.optional}>{t('clients:modal.optional')}</span></span>
            <input className={styles.input} type="email" value={form.email} onChange={e => update('email', e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('clients:contact.phone')} <span className={styles.optional}>{t('clients:modal.optional')}</span></span>
            <input className={styles.input} value={form.phone} onChange={e => update('phone', e.target.value)} />
          </label>
        </div>

        <div className={styles.checkGroup}>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={form.is_primary} onChange={e => update('is_primary', e.target.checked)} />
            <span>{t('clients:contact.primaryContact')}</span>
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={form.is_portal_recipient} onChange={e => update('is_portal_recipient', e.target.checked)} />
            <span>{t('clients:contact.portalUpdates')}</span>
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:contact.notes')} <span className={styles.optional}>{t('clients:modal.optional')}</span></span>
          <textarea className={styles.textarea} value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} />
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>{t('common:action.cancel')}</button>
          <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? t('clients:modal.saving') : isEdit ? t('common:action.save') : t('clients:contact.addContact')}</button>
        </div>
      </form>
    </Modal>
  )
}
