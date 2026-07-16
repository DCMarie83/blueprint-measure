import { useState } from 'react'
import { BILLING_TERMS } from '../../data/clientPropertyTypes'
import { GC_CLIENT_TYPE } from '../../lib/lite'
import styles from './lite.module.css'

// GC add/edit form. client_type is FIXED to general_contractor — it is never a
// visible choice here. Reuses the same clients table the contractor side uses.
export default function GCForm({ initial = null, onSubmit, onCancel }) {
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
    if (!canSubmit) { setError('A name and email are required.'); return }
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
        <span className={styles.fieldLabel}>Business Name</span>
        <input className={styles.input} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Acme Builders" />
      </div>
      <div className={styles.field} style={{ marginBottom: 10 }}>
        <span className={styles.fieldLabel}>Display Name</span>
        <input className={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How this GC appears in lists" />
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Email *</span>
          <input className={styles.input} type="email" value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} placeholder="office@acme.com" required />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Phone</span>
          <input className={styles.input} type="tel" value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>
      </div>
      <div className={styles.field} style={{ marginBottom: 10 }}>
        <span className={styles.fieldLabel}>Billing Terms</span>
        <select className={styles.select} value={billingTerms} onChange={e => setBillingTerms(e.target.value)}>
          <option value="">Select terms</option>
          {BILLING_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className={styles.field} style={{ marginBottom: 14 }}>
        <span className={styles.fieldLabel}>Notes</span>
        <textarea className={styles.input} rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes about this GC…" />
      </div>

      <div className={styles.rowBetween}>
        <button type="button" className={styles.secondaryBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.primaryBtn} disabled={!canSubmit || saving}>
          {saving ? 'Saving…' : initial ? 'Save GC' : 'Add GC'}
        </button>
      </div>
    </form>
  )
}
