import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'

export default function BillingCancelPage() {
  return (
    <>
      <AppHeader />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: 'var(--color-surface)', borderRadius: 12, padding: '48px 32px', boxShadow: 'var(--shadow-lg)' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
            Checkout canceled
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
            No charges were made. You can try again whenever you're ready.
          </p>
          <Link to="/subscribe" style={{ display: 'inline-block', padding: '12px 32px', background: '#f27243', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            Back to Subscribe
          </Link>
        </div>
      </div>
    </>
  )
}
