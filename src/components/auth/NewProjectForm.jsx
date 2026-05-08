import { useState } from 'react'
import styles from './NewSessionForm.module.css'

export default function NewProjectForm({ onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onCreate({ name, clientName, address })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="projectName">Project Name</label>
        <input
          id="projectName"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Lot 90 HG"
          required
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="clientName">Client Name (optional)</label>
        <input
          id="clientName"
          value={clientName}
          onChange={e => setClientName(e.target.value)}
          placeholder="e.g. Smith Residence"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="address">Address (optional)</label>
        <input
          id="address"
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="e.g. 123 Main St"
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? 'Creating…' : 'Create Job'}
        </button>
      </div>
    </form>
  )
}
