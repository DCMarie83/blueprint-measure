import { useState } from 'react'
import Modal from '../ui/Modal'
import styles from './ClientAddressModal.module.css'

const ADDRESS_TYPES = [
  { value: 'property', label: 'Property' },
  { value: 'billing', label: 'Billing' },
  { value: 'jobsite', label: 'Jobsite' },
  { value: 'mailing', label: 'Mailing' },
  { value: 'other', label: 'Other' },
]

export default function ClientAddressModal({ onClose, onSubmit, initialAddress }) {
  const isEdit = !!initialAddress
  const [form, setForm] = useState({
    address_type: initialAddress?.address_type ?? 'property',
    label: initialAddress?.label ?? '',
    street: initialAddress?.street ?? '',
    unit: initialAddress?.unit ?? '',
    city: initialAddress?.city ?? '',
    state: initialAddress?.state ?? '',
    zip: initialAddress?.zip ?? '',
    country: initialAddress?.country ?? 'US',
    notes: initialAddress?.notes ?? '',
    is_primary: initialAddress?.is_primary ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.street.trim() || !form.city.trim() || !form.state.trim() || !form.zip.trim()) {
      setError('Street, city, state, and ZIP are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        ...form,
        label: form.label.trim() || null,
        street: form.street.trim(),
        unit: form.unit.trim() || null,
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim(),
        country: form.country.trim() || 'US',
        notes: form.notes.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Address' : 'Add Address'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Type</span>
            <select className={styles.select} value={form.address_type} onChange={e => update('address_type', e.target.value)}>
              {ADDRESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Label <span className={styles.optional}>(optional)</span></span>
            <input className={styles.input} value={form.label} onChange={e => update('label', e.target.value)} placeholder="e.g. Main Office" />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Street</span>
          <input className={styles.input} value={form.street} onChange={e => update('street', e.target.value)} required />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Unit <span className={styles.optional}>(optional)</span></span>
          <input className={styles.input} value={form.unit} onChange={e => update('unit', e.target.value)} placeholder="Apt, Suite, etc." />
        </label>

        <div className={styles.row}>
          <label className={styles.fieldGrow}>
            <span className={styles.label}>City</span>
            <input className={styles.input} value={form.city} onChange={e => update('city', e.target.value)} required />
          </label>
          <label className={styles.fieldSmall}>
            <span className={styles.label}>State</span>
            <input className={styles.input} value={form.state} onChange={e => update('state', e.target.value)} maxLength={2} required />
          </label>
          <label className={styles.fieldSmall}>
            <span className={styles.label}>ZIP</span>
            <input className={styles.input} value={form.zip} onChange={e => update('zip', e.target.value)} required />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Country</span>
          <input className={styles.input} value={form.country} onChange={e => update('country', e.target.value)} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Notes <span className={styles.optional}>(optional)</span></span>
          <textarea className={styles.textarea} value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} />
        </label>

        <label className={styles.checkRow}>
          <input type="checkbox" checked={form.is_primary} onChange={e => update('is_primary', e.target.checked)} />
          <span>Primary address</span>
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save' : 'Add Address'}</button>
        </div>
      </form>
    </Modal>
  )
}
