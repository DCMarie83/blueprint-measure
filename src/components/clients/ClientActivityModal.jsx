import { useState } from 'react'
import Modal from '../ui/Modal'
import styles from './ClientActivityModal.module.css'

const MANUAL_TYPES = [
  { value: 'note', label: 'Note' },
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
  { value: 'sms', label: 'SMS' },
  { value: 'meeting', label: 'Meeting' },
]

export default function ClientActivityModal({ activity, onClose, onSave }) {
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
      setError('Title is required.')
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
    <Modal title={isEdit ? 'Edit Activity' : 'Log Activity'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <label className={styles.field}>
          <span className={styles.label}>Type</span>
          <select className={styles.select} value={form.activity_type} onChange={e => update('activity_type', e.target.value)}>
            {MANUAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Title</span>
          <input className={styles.input} value={form.title} onChange={e => update('title', e.target.value)} placeholder="Quick summary, e.g. 'Called about Q3 quote'" required />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Details <span className={styles.optional}>(optional)</span></span>
          <textarea className={styles.textarea} value={form.body} onChange={e => update('body', e.target.value)} rows={4} placeholder="Details, talking points, next steps..." />
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save' : 'Log Activity'}</button>
        </div>
      </form>
    </Modal>
  )
}
