import { useState } from 'react'
import styles from './NewSessionForm.module.css'

// Form shown inside a modal when the user clicks "New Session".
// Collects client name and project name before creating the session.
export default function NewSessionForm({ onCreate, onCancel }) {
  const [clientName, setClientName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onCreate({ clientName, projectName })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="clientName">Client Name</label>
        <input
          id="clientName"
          value={clientName}
          onChange={e => setClientName(e.target.value)}
          placeholder="e.g. Smith Residence"
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="projectName">Project Name</label>
        <input
          id="projectName"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          placeholder="e.g. Interior Repaint 2024"
          required
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? 'Creating…' : 'Create Session'}
        </button>
      </div>
    </form>
  )
}
