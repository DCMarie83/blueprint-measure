import { useState } from 'react'
import styles from './NewSessionForm.module.css'

// Form shown inside a modal when the user clicks "New Session" or "Add Blueprint".
// When projectId is supplied, the project_name field is hidden (session is scoped to the project).
export default function NewSessionForm({ onCreate, onCancel, projectId }) {
  const [description, setDescription] = useState('')
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onCreate({ description: description || null, projectName, projectId })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="description">Description (optional)</label>
        <input
          id="description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Floor Plan, Electrical, Site Plan"
        />
      </div>

      {!projectId && (
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
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? 'Creating…' : (projectId ? 'Add Blueprint' : 'Create Session')}
        </button>
      </div>
    </form>
  )
}
