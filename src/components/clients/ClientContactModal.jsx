import { useState } from 'react'
import Modal from '../ui/Modal'
import styles from './ClientContactModal.module.css'

export default function ClientContactModal({ contact, onClose, onSave }) {
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
      setError('Name is required.')
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
    <Modal title={isEdit ? 'Edit Contact' : 'Add Contact'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input className={styles.input} value={form.name} onChange={e => update('name', e.target.value)} required />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Title <span className={styles.optional}>(optional)</span></span>
          <input className={styles.input} value={form.title} onChange={e => update('title', e.target.value)} placeholder="e.g. Property Manager" />
        </label>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Email <span className={styles.optional}>(optional)</span></span>
            <input className={styles.input} type="email" value={form.email} onChange={e => update('email', e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Phone <span className={styles.optional}>(optional)</span></span>
            <input className={styles.input} value={form.phone} onChange={e => update('phone', e.target.value)} />
          </label>
        </div>

        <div className={styles.checkGroup}>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={form.is_primary} onChange={e => update('is_primary', e.target.checked)} />
            <span>Primary contact</span>
          </label>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={form.is_portal_recipient} onChange={e => update('is_portal_recipient', e.target.checked)} />
            <span>Receives portal updates</span>
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Notes <span className={styles.optional}>(optional)</span></span>
          <textarea className={styles.textarea} value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} />
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save' : 'Add Contact'}</button>
        </div>
      </form>
    </Modal>
  )
}
