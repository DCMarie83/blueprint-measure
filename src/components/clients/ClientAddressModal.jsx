import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import styles from './ClientAddressModal.module.css'

const ADDRESS_TYPES = [
  { value: 'property', label: 'common:addressType.property' },
  { value: 'billing', label: 'common:addressType.billing' },
  { value: 'jobsite', label: 'common:addressType.jobsite' },
  { value: 'mailing', label: 'common:addressType.mailing' },
  { value: 'other', label: 'common:addressType.other' },
]

export default function ClientAddressModal({ onClose, onSubmit, initialAddress }) {
  const { t } = useTranslation()
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
      setError(t('clients:address.requiredFields'))
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
    <Modal title={isEdit ? t('clients:address.editAddress') : t('clients:address.addAddress')} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>{t('clients:modal.type')}</span>
            <select className={styles.select} value={form.address_type} onChange={e => update('address_type', e.target.value)}>
              {ADDRESS_TYPES.map(at => <option key={at.value} value={at.value}>{t(at.label)}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t('clients:address.label')} <span className={styles.optional}>{t('clients:modal.optional')}</span></span>
            <input className={styles.input} value={form.label} onChange={e => update('label', e.target.value)} placeholder={t('clients:address.labelPlaceholder')} />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:address.street')}</span>
          <input className={styles.input} value={form.street} onChange={e => update('street', e.target.value)} required />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:address.unit')} <span className={styles.optional}>{t('clients:modal.optional')}</span></span>
          <input className={styles.input} value={form.unit} onChange={e => update('unit', e.target.value)} placeholder={t('clients:address.unitPlaceholder')} />
        </label>

        <div className={styles.row}>
          <label className={styles.fieldGrow}>
            <span className={styles.label}>{t('clients:address.city')}</span>
            <input className={styles.input} value={form.city} onChange={e => update('city', e.target.value)} required />
          </label>
          <label className={styles.fieldSmall}>
            <span className={styles.label}>{t('clients:address.state')}</span>
            <input className={styles.input} value={form.state} onChange={e => update('state', e.target.value)} maxLength={2} required />
          </label>
          <label className={styles.fieldSmall}>
            <span className={styles.label}>{t('clients:address.zip')}</span>
            <input className={styles.input} value={form.zip} onChange={e => update('zip', e.target.value)} required />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:address.country')}</span>
          <input className={styles.input} value={form.country} onChange={e => update('country', e.target.value)} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:address.notes')} <span className={styles.optional}>{t('clients:modal.optional')}</span></span>
          <textarea className={styles.textarea} value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} />
        </label>

        <label className={styles.checkRow}>
          <input type="checkbox" checked={form.is_primary} onChange={e => update('is_primary', e.target.checked)} />
          <span>{t('clients:address.primaryAddress')}</span>
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>{t('common:action.cancel')}</button>
          <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? t('clients:modal.saving') : isEdit ? t('common:action.save') : t('clients:address.addAddress')}</button>
        </div>
      </form>
    </Modal>
  )
}
