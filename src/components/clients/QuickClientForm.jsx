import { useState, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import { useClients } from '../../hooks/useClients'
import styles from './QuickClientForm.module.css'

const QuickClientForm = forwardRef(function QuickClientForm({ onCreated, onCancel, hideSubmitButton = false }, ref) {
  const { t } = useTranslation()
  const { createClient } = useClients()
  const [clientType, setClientType] = useState('residential')
  const [displayName, setDisplayName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [primaryEmail, setPrimaryEmail] = useState('')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const showBusiness = clientType === 'commercial' || clientType === 'general_contractor'

  async function handleSubmit() {
    const name = displayName.trim() || (showBusiness ? businessName.trim() : '')
    if (!name) { setError(t('clients:quickForm.nameRequired')); return null }
    setSaving(true)
    setError('')
    try {
      const payload = {
        client_type: clientType,
        display_name: name,
        business_name: showBusiness ? businessName.trim() || null : null,
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
        <button type="button" className={`${styles.typeBtn} ${clientType === 'residential' ? styles.typeBtnActive : ''}`} onClick={() => setClientType('residential')}>{t('clients:form.residential')}</button>
        <button type="button" className={`${styles.typeBtn} ${clientType === 'commercial' ? styles.typeBtnActive : ''}`} onClick={() => setClientType('commercial')}>{t('clients:form.commercial')}</button>
        <button type="button" className={`${styles.typeBtn} ${clientType === 'general_contractor' ? styles.typeBtnActive : ''}`} onClick={() => setClientType('general_contractor')}>{t('clients:form.generalContractor')}</button>
      </div>
      {showBusiness && (
        <label className={styles.field}><span>{t('clients:form.businessName')}</span><input className={styles.input} value={businessName} onChange={e => { setBusinessName(e.target.value); if (!displayName) setDisplayName(e.target.value) }} placeholder={t('clients:form.acmeCorp')} /></label>
      )}
      <label className={styles.field}><span>{showBusiness ? t('clients:form.displayName') : t('clients:quickForm.clientNameRequired')}</span><input className={styles.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={showBusiness ? t('clients:quickForm.displayNamePlaceholder') : t('clients:form.clientNamesPlaceholder')} /></label>
      <div className={styles.row}>
        <label className={styles.field}><span>{t('clients:form.email')}</span><input className={styles.input} type="email" value={primaryEmail} onChange={e => setPrimaryEmail(e.target.value)} placeholder={t('clients:form.emailPlaceholder')} /></label>
        <label className={styles.field}><span>{t('clients:form.phone')}</span><input className={styles.input} type="tel" value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} placeholder={t('clients:form.phonePlaceholder')} /></label>
      </div>
      {!hideSubmitButton && (
        <div className={styles.actions}>
          {onCancel && <button type="button" className={styles.cancelBtn} onClick={onCancel}>{t('common:action.cancel')}</button>}
          <button type="button" className={styles.saveBtn} onClick={handleSubmit} disabled={saving}>{saving ? t('clients:quickForm.creating') : t('clients:form.createClient')}</button>
        </div>
      )}
    </div>
  )
})

export default QuickClientForm
