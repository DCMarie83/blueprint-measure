import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import BackLink from '../components/BackLink'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function MaterialOrderBuilderPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const isAdmin = userProfile?.role === 'contractor_admin' || user?.email === 'main@ngautomationhub.com'

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!orderId) return
      setLoading(true)
      const { data, error: err } = await supabase
        .from('material_orders')
        .select('*')
        .eq('id', orderId)
        .single()
      if (cancelled) return
      if (err) setError(err.message)
      else setOrder(data)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [orderId])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
        <AppHeader />
        <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px' }}>
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)' }}>Loading…</div>
        </main>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
        <AppHeader />
        <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px' }}>
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)' }}>{error || 'Materials order not found'}</div>
        </main>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <AppHeader />
      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px' }}>
        <BackLink to={`/project/${order.project_id}`} label="Back to project" />
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 4px' }}>{order.title || 'Materials Order'}</h1>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{order.status}</div>
        <div style={{ marginTop: 24, padding: 24, border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-muted)' }}>
          Tiered materials editor coming in the next pass.
        </div>
      </main>
    </div>
  )
}
