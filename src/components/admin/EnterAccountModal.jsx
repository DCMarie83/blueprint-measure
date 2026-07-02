import { useState } from 'react'
import styles from '../../pages/admin/sections.module.css'

export default function EnterAccountModal({ companyName, onConfirm, onCancel }) {
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
        You are about to view <strong>{companyName}</strong> as a super admin. Your actions will be logged.
      </p>
      <label className={styles.modalField}>
        <span className={styles.formLabel}>
          Reason for accessing this account (optional)
        </span>
        <textarea
          className={styles.formInput}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. Onboarding support, debugging estimate issue"
        />
      </label>
      <div className={styles.formActions}>
        <button className={styles.secondaryBtn} onClick={onCancel}>
          Cancel
        </button>
        <button className={styles.submitBtn} onClick={handleConfirm} disabled={loading}>
          {loading ? 'Entering...' : 'Enter Account'}
        </button>
      </div>
    </div>
  )
}
