import { useState } from 'react'

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
      <p style={{ fontSize: 14, color: 'var(--color-text)', marginBottom: 12 }}>
        You are about to view <strong>{companyName}</strong> as a super admin. Your actions will be logged.
      </p>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Reason for accessing this account (optional)
        </span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. Onboarding support, debugging estimate issue"
          style={{ padding: '8px 10px', fontSize: 13, border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', resize: 'vertical' }}
        />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={onCancel}
          style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', color: 'var(--color-text-muted)', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'Entering...' : 'Enter Account'}
        </button>
      </div>
    </div>
  )
}
