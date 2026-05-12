import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './PortalPage.module.css'

export default function PortalPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!token) { setError(true); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data: row, error: err } = await supabase
          .from('portal_view')
          .select('*')
          .eq('portal_token', token)
          .maybeSingle()
        if (cancelled) return
        if (err || !row) setError(true)
        else setData(row)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.loading}>Loading…</div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.notFoundTitle}>Portal Not Available</h1>
          <p className={styles.notFoundText}>
            This portal link is invalid or has been disabled by the contractor.
          </p>
          <p className={styles.footer}>Powered by RivetDog</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.companyHeader}>
          <h2 className={styles.companyName}>{data.company_name || 'Your Contractor'}</h2>
        </div>

        <div className={styles.projectBlock}>
          <h1 className={styles.projectName}>{data.project_name}</h1>
          {data.address && <p className={styles.address}>{data.address}</p>}
        </div>

        {data.status_label && (
          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>Current Status</span>
            <span className={styles.statusBadge}>{data.status_label}</span>
          </div>
        )}

        {data.client_name && (
          <div className={styles.clientRow}>
            <span className={styles.clientRowLabel}>Your contact</span>
            <div>
              <div className={styles.clientName}>{data.client_name}</div>
              {data.client_business && (
                <div className={styles.clientBusiness}>{data.client_business}</div>
              )}
            </div>
          </div>
        )}

        <div className={styles.footerWrap}>
          <p className={styles.contactNote}>
            Have questions? Contact your contractor directly.
          </p>
          <p className={styles.footer}>Powered by RivetDog</p>
        </div>
      </div>
    </div>
  )
}
