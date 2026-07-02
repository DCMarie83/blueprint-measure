import { useState, useRef } from 'react'
import { useClients } from '../../hooks/useClients'
import ClientPicker from '../clients/ClientPicker'
import QuickClientForm from '../clients/QuickClientForm'
import styles from './NewSessionForm.module.css'

export default function NewProjectForm({ onCreate, onCancel }) {
  const { clients } = useClients()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [buildMethod, setBuildMethod] = useState('blueprint') // 'blueprint' | 'manual'
  const [clientMode, setClientMode] = useState('skip')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const quickFormRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Job name is required'); return }
    setError('')
    setLoading(true)

    try {
      let clientId = selectedClientId

      if (clientMode === 'new' && quickFormRef.current) {
        const newClient = await quickFormRef.current.submit()
        if (!newClient) { setLoading(false); return }
        clientId = newClient.id
      }

      await onCreate({ name: name.trim(), address: address.trim() || null, clientId }, buildMethod)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const modeBtn = (mode, label) => (
    <button
      type="button"
      onClick={() => { setClientMode(mode); if (mode === 'skip') setSelectedClientId(null) }}
      style={{
        flex: 1,
        padding: '7px 10px',
        fontSize: 13,
        fontWeight: 500,
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        background: clientMode === mode ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-bg)',
        color: clientMode === mode ? 'var(--color-primary)' : 'var(--color-text-muted)',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {label}
    </button>
  )

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="projectName">Job Name *</label>
        <input
          id="projectName"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Smith Residence Interior"
          required
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="address">Property Address (optional)</label>
        <input
          id="address"
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="e.g. 123 Main St"
        />
      </div>

      <div className={styles.field}>
        <label>How do you want to build this estimate?</label>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 3 }}>
          <button
            type="button"
            onClick={() => setBuildMethod('blueprint')}
            style={{
              flex: 1, padding: '10px 10px', fontSize: 13, fontWeight: 500, border: 'none',
              borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'center',
              background: buildMethod === 'blueprint' ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-bg)',
              color: buildMethod === 'blueprint' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <div style={{ fontWeight: 600 }}>Measure a Blueprint</div>
            <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>Upload plans and measure to scale</div>
          </button>
          <button
            type="button"
            onClick={() => setBuildMethod('manual')}
            style={{
              flex: 1, padding: '10px 10px', fontSize: 13, fontWeight: 500, border: 'none',
              borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'center',
              background: buildMethod === 'manual' ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-bg)',
              color: buildMethod === 'manual' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <div style={{ fontWeight: 600 }}>Enter Measurements Manually</div>
            <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>Type in your own measurements & line items</div>
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <label>Client (optional)</label>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 3 }}>
          {modeBtn('skip', 'Skip')}
          {modeBtn('existing', 'Link Existing')}
          {modeBtn('new', 'Create New')}
        </div>

        {clientMode === 'existing' && (
          <ClientPicker clients={clients} value={selectedClientId} onChange={setSelectedClientId} />
        )}

        {clientMode === 'new' && (
          <QuickClientForm
            ref={quickFormRef}
            hideSubmitButton
            onCreated={(c) => setSelectedClientId(c.id)}
          />
        )}
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
