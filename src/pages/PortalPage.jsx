import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PortalEstimateSection from '../components/portal/PortalEstimateSection'
import PaymentInstructionsBlock from '../components/invoices/PaymentInstructionsBlock'
import LanguageToggle from '../components/LanguageToggle'
import styles from './PortalPage.module.css'

export default function PortalPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [estimateData, setEstimateData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!token) { setError(true); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        // Fetch portal project + estimate data in parallel — both are
        // token-scoped RPCs (portal_view SELECT was revoked from anon;
        // get_portal_project filters by token + portal_enabled internally)
        const [portalRes, estimateRes] = await Promise.all([
          supabase.rpc('get_portal_project', { p_portal_token: token }),
          supabase.rpc('get_portal_estimate', { p_portal_token: token }),
        ])

        if (cancelled) return

        if (portalRes.error || !portalRes.data) {
          setError(true)
        } else {
          setData(portalRes.data)
        }

        // Estimate may not exist (null is fine)
        if (estimateRes.data && estimateRes.data.estimate) {
          setEstimateData(estimateRes.data)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  // Enforce portal theme on document root (must be above early returns — Rules of Hooks)
  useEffect(() => {
    if (!data) return
    const theme = data.company_portal_theme || 'light'
    const previous = document.documentElement.getAttribute('data-theme')
    document.documentElement.setAttribute('data-theme', theme)
    return () => {
      if (previous) document.documentElement.setAttribute('data-theme', previous)
      else document.documentElement.removeAttribute('data-theme')
    }
  }, [data?.company_portal_theme])

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

  const tenantName = data.company_name || 'Your Contractor'
  const tenantLogoUrl = data.company_logo_url || null
  const tenantPrimary = data.company_primary_color || null

  return (
    <div className={styles.page}>
      <div className={styles.card} style={tenantPrimary ? { '--color-primary': tenantPrimary } : undefined}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageToggle />
        </div>
        <div className={styles.companyHeader}>
          {tenantLogoUrl && <img src={tenantLogoUrl} alt={`${tenantName} logo`} className={styles.companyLogo} />}
          <h2 className={styles.companyName}>{tenantName}</h2>
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

        {(data.scheduled_start || data.estimated_completion) && (
          <div style={{ display: 'flex', gap: 24, padding: '12px 0', fontSize: 14, color: 'var(--color-text-muted, #555)' }}>
            {data.scheduled_start && (
              <div>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 2 }}>Start Date</span>
                <span style={{ color: 'var(--color-text, #1b2426)', fontWeight: 500 }}>
                  {new Date(data.scheduled_start).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}
            {data.estimated_completion && (
              <div>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 2 }}>Est. Completion</span>
                <span style={{ color: 'var(--color-text, #1b2426)', fontWeight: 500 }}>
                  {new Date(data.estimated_completion).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}
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

        {/* Estimate section — only renders if estimate exists with sent/accepted/declined status */}
        {estimateData && (
          <PortalEstimateSection
            estimate={estimateData.estimate}
            lineItems={estimateData.line_items || []}
            portalToken={token}
          />
        )}

        {/* Deposit payment methods (only when deposit > 0) */}
        {estimateData?.estimate?.deposit_amount > 0 && (
          <PaymentInstructionsBlock paymentInstructions={data.company_payment_instructions} variant="portal" heading="Deposit Payment Methods" />
        )}

        <div className={styles.footerWrap}>
          <p className={styles.contactNote}>
            Have questions? Contact your contractor directly.
          </p>
          <p className={styles.footer}>Powered by RivetDog for {tenantName}</p>
        </div>
      </div>
    </div>
  )
}
