import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BILLING_TERMS } from '../../data/clientPropertyTypes'
import { GC_CLIENT_TYPE } from '../../lib/lite'
import styles from './lite.module.css'

// GC add/edit form. client_type is FIXED to general_contractor — it is never a
// visible choice here. Reuses the same clients table the contractor side uses.
export default function GCForm({ initial = null, onSubmit, onCancel }) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState(initial?.display_name || '')
  const [businessName, setBusinessName] = useState(initial?.business_name || '')
  const [primaryEmail, setPrimaryEmail] = useState(initial?.primary_email || '')
  const [primaryPhone, setPrimaryPhone] = useState(initial?.primary_phone || '')
  const [billingTerms, setBillingTerms] = useState(initial?.billing_terms || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const canSubmit = !!(displayName.trim() || businessName.trim()) && !!primaryEmail.trim()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) { setError(t('lite:gcForm.nameEmailRequired')); return }
    setSaving(true)
    setError('')
    try {
      const name = displayName.trim() || businessName.trim()
      const payload = {
        client_type: GC_CLIENT_TYPE,
        display_name: name,
        business_name: businessName.trim() || null,
        primary_email: primaryEmail.trim(),
        primary_phone: primaryPhone.trim() || null,
        billing_terms: billingTerms || null,
        notes: notes.trim() || null,
      }
      await onSubmit(payload)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.field} style={{ marginBottom: 10 }}>
        <span className={styles.fieldLabel}>{t('lite:gcForm.businessName')}</span>
        <input className={styles.input} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder={t('lite:gcForm.businessNamePh')} />
      </div>
      <div className={styles.field} style={{ marginBottom: 10 }}>
        <span className={styles.fieldLabel}>{t('lite:gcForm.displayName')}</span>
        <input className={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={t('lite:gcForm.displayNamePh')} />
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('lite:gcForm.email')}</span>
          <input className={styles.input} type="email" value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} placeholder={t('lite:gcForm.emailPh')} required />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('lite:gcForm.phone')}</span>
          <input className={styles.input} type="tel" value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>
      </div>
      <div className={styles.field} style={{ marginBottom: 10 }}>
        <span className={styles.fieldLabel}>{t('lite:gcForm.billingTerms')}</span>
        <select className={styles.select} value={billingTerms} onChange={e => setBillingTerms(e.target.value)}>
          <option value="">{t('lite:gcForm.selectTerms')}</option>
          {BILLING_TERMS.map(bt => <option key={bt.value} value={bt.value}>{t(bt.label)}</option>)}
        </select>
      </div>
      <div className={styles.field} style={{ marginBottom: 14 }}>
        <span className={styles.fieldLabel}>{t('lite:gcForm.notes')}</span>
        <textarea className={styles.input} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('lite:gcForm.notesPh')} />
      </div>

      <div className={styles.rowBetween}>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel}>{t('common:action.cancel')}</button>
        <button type="submit" className={styles.primaryBtn} disabled={!canSubmit || saving}>
          {saving ? t('lite:gcForm.saving') : initial ? t('lite:gcForm.saveGc') : t('lite:gcForm.addGc')}
        </button>
      </div>
    </form>
  )
}
