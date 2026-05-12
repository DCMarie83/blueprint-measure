import { useState, forwardRef, useImperativeHandle } from 'react'
import { useClients } from '../../hooks/useClients'
import styles from './QuickClientForm.module.css'

const QuickClientForm = forwardRef(function QuickClientForm({ onCreated, onCancel, hideSubmitButton = false }, ref) {
  const { createClient } = useClients()
  const [clientType, setClientType] = useState('residential')
  const [displayName, setDisplayName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [primaryEmail, setPrimaryEmail] = useState('')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    const name = displayName.trim() || (clientType === 'commercial' ? businessName.trim() : '')
    if (!name) { setError('Client name is required'); return null }
    setSaving(true)
    setError('')
    try {
      const payload = {
        client_type: clientType,
        display_name: name,
        business_name: clientType === 'commercial' ? businessName.trim() || null : null,
        primary_email: primaryEmail.trim() || null,
        primary_phone: primaryPhone.trim() || null,
      }
      const newClient = await createClient(payload, [])
      onCreated?.(newClient)
      return newClient
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({ submit: handleSubmit }))

  return (
    <div className={styles.form}>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.typeRow}>
        <button type="button" className={`${styles.typeBtn} ${clientType === 'residential' ? styles.typeBtnActive : ''}`} onClick={() => setClientType('residential')}>Residential</button>
        <button type="button" className={`${styles.typeBtn} ${clientType === 'commercial' ? styles.typeBtnActive : ''}`} onClick={() => setClientType('commercial')}>Commercial</button>
      </div>
      {clientType === 'commercial' && (
        <label className={styles.field}><span>Business Name</span><input className={styles.input} value={businessName} onChange={e => { setBusinessName(e.target.value); if (!displayName) setDisplayName(e.target.value) }} placeholder="Acme Corp" /></label>
      )}
      <label className={styles.field}><span>{clientType === 'commercial' ? 'Display Name' : 'Client Name *'}</span><input className={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={clientType === 'commercial' ? 'How they appear in lists' : 'John & Mary Smith'} /></label>
      <div className={styles.row}>
        <label className={styles.field}><span>Email</span><input className={styles.input} type="email" value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} placeholder="client@email.com" /></label>
        <label className={styles.field}><span>Phone</span><input className={styles.input} type="tel" value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} placeholder="(555) 123-4567" /></label>
      </div>
      {!hideSubmitButton && (
        <div className={styles.actions}>
          {onCancel && <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>}
          <button type="button" className={styles.saveBtn} onClick={handleSubmit} disabled={saving}>{saving ? 'Creating...' : 'Create Client'}</button>
        </div>
      )}
    </div>
  )
})

export default QuickClientForm
