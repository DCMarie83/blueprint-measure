import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import styles from './ClientActivityModal.module.css'

const MANUAL_TYPES = [
  { value: 'note', label: 'common:manualType.note' },
  { value: 'email', label: 'common:manualType.email' },
  { value: 'call', label: 'common:manualType.call' },
  { value: 'sms', label: 'common:manualType.sms' },
  { value: 'meeting', label: 'common:manualType.meeting' },
]

export default function ClientActivityModal({ activity, onClose, onSave }) {
  const { t } = useTranslation()
  const isEdit = !!activity
  const [form, setForm] = useState({
    activity_type: activity?.activity_type ?? 'note',
    title: activity?.title ?? '',
    body: activity?.body ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError(t('clients:activity.titleRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(activity?.id ?? null, {
        activity_type: form.activity_type,
        title: form.title.trim(),
        body: form.body.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? t('clients:activity.editActivity') : t('clients:activity.logActivity')} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:modal.type')}</span>
          <select className={styles.select} value={form.activity_type} onChange={e => update('activity_type', e.target.value)}>
            {MANUAL_TYPES.map(mt => <option key={mt.value} value={mt.value}>{t(mt.label)}</option>)}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:activity.titleLabel')}</span>
          <input className={styles.input} value={form.title} onChange={e => update('title', e.target.value)} placeholder={t('clients:activity.titlePlaceholder')} required />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t('clients:activity.details')} <span className={styles.optional}>{t('clients:modal.optional')}</span></span>
          <textarea className={styles.textarea} value={form.body} onChange={e => update('body', e.target.value)} rows={4} placeholder={t('clients:activity.detailsPlaceholder')} />
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>{t('common:action.cancel')}</button>
          <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? t('clients:modal.saving') : isEdit ? t('common:action.save') : t('clients:activity.logActivity')}</button>
        </div>
      </form>
    </Modal>
  )
}
