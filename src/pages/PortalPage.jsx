import { useParams } from 'react-router-dom'
import { BRAND } from '../lib/config'

export default function PortalPage() {
  const { token } = useParams()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', color: 'var(--color-text)', padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Project Portal</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>Portal for token {token} — coming Friday</p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{BRAND.name}</p>
      </div>
    </div>
  )
}
