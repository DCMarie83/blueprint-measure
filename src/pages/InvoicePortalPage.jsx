import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateInvoicePDF } from '../lib/generateInvoicePDF'
import InvoiceStatusBadge from '../components/invoices/InvoiceStatusBadge'
import PaymentInstructionsBlock from '../components/invoices/PaymentInstructionsBlock'
import styles from './PortalPage.module.css'

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function InvoicePortalPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!token) { setError(true); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data: result, error: rpcErr } = await supabase.rpc('get_portal_invoice', { p_portal_token: token })
        if (cancelled) return
        if (rpcErr || !result?.invoice) { setError(true) } else { setData(result) }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  async function handleDownload() {
    if (!data) return
    setDownloading(true)
    try {
      const inv = data.invoice
      const lineItems = data.line_items || []
      const companyData = { name: data.company_name, primary_color: data.company_primary_color, payment_instructions: data.company_payment_instructions }
      // Pre-fetch logo for PDF
      if (data.company_logo_url) {
        try {
          const res = await fetch(data.company_logo_url)
          if (res.ok) {
            const blob = await res.blob()
            const reader = new FileReader()
            companyData.logo_data = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob) })
          }
        } catch { /* skip logo */ }
      }
      const pdf = generateInvoicePDF({
        invoice: inv, lineItems,
        project: { name: data.project_name, address: data.project_address },
        client: { display_name: data.client_name, business_name: data.client_business },
        company: companyData,
        returnAs: 'blob',
      })
      const url = URL.createObjectURL(pdf)
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv.invoice_number}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

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
          <h1 className={styles.notFoundTitle}>Invoice Not Available</h1>
          <p className={styles.notFoundText}>This invoice link is invalid or has not been sent yet.</p>
          <p className={styles.footer}>Powered by RivetDog</p>
        </div>
      </div>
    )
  }

  const inv = data.invoice
  const lineItems = data.line_items || []
  const tenantName = data.company_name || 'Your Contractor'
  const tenantLogoUrl = data.company_logo_url || null
  const tenantPrimary = data.company_primary_color || null
  const adjNum = Number(inv.adjustment_amount) || 0

  return (
    <div className={styles.page}>
      <div className={styles.card} style={tenantPrimary ? { '--color-primary': tenantPrimary } : undefined}>
        <div className={styles.companyHeader}>
          {tenantLogoUrl && <img src={tenantLogoUrl} alt={`${tenantName} logo`} className={styles.companyLogo} />}
          <h2 className={styles.companyName}>{tenantName}</h2>
        </div>

        {/* Invoice header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text)' }}>
            {inv.title || 'Invoice'}
          </h1>
          <div style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            {inv.invoice_number} &middot; Issued {fmtDate(inv.created_at)}
            {inv.due_date && <> &middot; <strong style={{ color: 'var(--color-primary)' }}>Due {fmtDate(inv.due_date)}</strong></>}
          </div>
          <InvoiceStatusBadge status={inv.status} isOverdue={inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < new Date()} />
        </div>

        {/* Project info */}
        <div className={styles.projectBlock}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--color-text)' }}>{data.project_name}</h2>
          {data.project_address && <p className={styles.address}>{data.project_address}</p>}
        </div>

        {data.client_name && (
          <div className={styles.clientRow}>
            <span className={styles.clientRowLabel}>Billed to</span>
            <div>
              <div className={styles.clientName}>{data.client_name}</div>
              {data.client_business && <div className={styles.clientBusiness}>{data.client_business}</div>}
            </div>
          </div>
        )}

        {/* Line items */}
        {lineItems.length > 0 && (
          <div style={{ margin: '20px 0', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>Qty</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>Unit</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>Rate</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={li.id || i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '8px 6px', color: 'var(--color-text)' }}>{li.description}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--color-text-muted)' }}>{Number(li.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{UNIT_LABELS[li.unit] || li.unit}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{fmtMoney(li.unit_rate)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmtMoney(li.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, margin: '16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 220, fontSize: 14, color: 'var(--color-text-muted)' }}>
            <span>Subtotal</span><span>{fmtMoney(inv.subtotal)}</span>
          </div>
          {adjNum !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 220, fontSize: 14, color: 'var(--color-text-muted)' }}>
              <span>{inv.adjustment_label || 'Adjustment'}</span><span>{fmtMoney(adjNum)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 220, fontSize: 18, fontWeight: 700, color: 'var(--color-text)', paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
            <span>Total</span><span style={{ fontFamily: 'monospace' }}>{fmtMoney(inv.total)}</span>
          </div>
        </div>

        {/* Notes + Terms */}
        {inv.notes && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-muted)', marginBottom: 6 }}>Notes</div>
            <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{inv.notes}</p>
          </div>
        )}
        {inv.terms && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-muted)', marginBottom: 6 }}>Terms</div>
            <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{inv.terms}</p>
          </div>
        )}

        {/* Payment info if paid */}
        {inv.paid_at && (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-success)', marginBottom: 4 }}>Payment Received</div>
            <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
              {fmtMoney(inv.paid_amount)} on {fmtDate(inv.paid_at)}
              {inv.payment_method && <> via {inv.payment_method.replace(/_/g, ' ')}</>}
            </div>
          </div>
        )}

        {/* Payment instructions */}
        <PaymentInstructionsBlock paymentInstructions={data.company_payment_instructions} variant="portal" />

        {/* Download PDF */}
        <div style={{ textAlign: 'center', margin: '24px 0 8px' }}>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 24px', background: 'var(--color-primary)', color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer',
            }}
          >
            <Download size={16} /> {downloading ? 'Generating…' : 'Download PDF'}
          </button>
        </div>

        <div className={styles.footerWrap}>
          <p className={styles.contactNote}>Have questions? Contact your contractor directly.</p>
          <p className={styles.footer}>Powered by RivetDog for {tenantName}</p>
        </div>
      </div>
    </div>
  )
}
