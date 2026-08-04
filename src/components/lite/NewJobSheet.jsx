import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ClientPicker from '../clients/ClientPicker'
import styles from '../../pages/lite/lite.module.css'

// Shared "start a new job" form for Lite. Extracted from the Daily Log so the
// jobs list can open the SAME create (name + GC picker) without duplicating the
// logic. createProject is passed in from the caller's useProjects instance so
// the caller's own projects list updates on success (each useProjects keeps its
// own local state). On success the parent decides where to go via onCreated.
export default function NewJobSheet({ gcs, createProject, onCreated, onCancel }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [gcId, setGcId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate() {
    if (!name.trim() || !gcId) return
    setCreating(true); setError(null)
    try {
      const proj = await createProject({ name: name.trim(), clientId: gcId })
      onCreated(proj)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={styles.card} style={{ marginTop: 8, marginBottom: 0 }}>
      <div className={styles.field} style={{ marginBottom: 8 }}>
        <span className={styles.fieldLabel}>{t('lite:components.jobName')}</span>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder={t('lite:components.jobNamePh')} autoFocus />
      </div>
      <div className={styles.field} style={{ marginBottom: 8 }}>
        <span className={styles.fieldLabel}>{t('lite:components.generalContractor')}</span>
        <ClientPicker clients={gcs} value={gcId} onChange={setGcId} placeholder={t('lite:components.searchGcs')} />
      </div>
      {error && <div className={styles.error} style={{ marginBottom: 8 }}>{error}</div>}
      <div className={styles.rowBetween}>
        <button className={styles.secondaryBtn} onClick={onCancel}>{t('common:action.cancel')}</button>
        <button className={styles.primaryBtn} disabled={!name.trim() || !gcId || creating} onClick={handleCreate}>
          {creating ? t('lite:components.creating') : t('lite:components.createJob')}
        </button>
      </div>
    </div>
  )
}
