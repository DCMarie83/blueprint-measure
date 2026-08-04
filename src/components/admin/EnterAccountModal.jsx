import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from '../../pages/admin/sections.module.css'

export default function EnterAccountModal({ companyName, onConfirm, onCancel }) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    await onConfirm(notes)
    setLoading(false)
  }

  return (
    <div>
      <p className={styles.modalText}>
        {t('admin:impersonation.enterIntro1')} <strong>{companyName}</strong> {t('admin:impersonation.enterIntro2')}
      </p>
      <label className={styles.modalField}>
        <span className={styles.formLabel}>
          {t('admin:impersonation.reasonLabel')}
        </span>
        <textarea
          className={styles.formInput}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder={t('admin:impersonation.reasonPlaceholder')}
        />
      </label>
      <div className={styles.formActions}>
        <button className={styles.secondaryBtn} onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
        <button className={styles.submitBtn} onClick={handleConfirm} disabled={loading}>
          {loading ? t('admin:impersonation.entering') : t('admin:impersonation.enterAccount')}
        </button>
      </div>
    </div>
  )
}
