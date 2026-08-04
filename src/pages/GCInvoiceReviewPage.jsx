import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import InvoiceStatusBadge from '../components/invoices/InvoiceStatusBadge'
import PaymentInstructionsBlock from '../components/invoices/PaymentInstructionsBlock'
import LanguageToggle from '../components/LanguageToggle'
import styles from './PortalPage.module.css'

// The GC response loop. A general contractor opens this from a phone email,
// reviews the invoice, and either approves it or sends it back with a note.
// This is a GC's first interactive contact with RivetDog, so it is strictly
// pun-free and RivetDog-forward — never "Lite" anywhere GC-facing.
//
// Loads through the same anon RPC the client portal uses (get_portal_invoice).
// The response itself goes through the anon RPC gc_respond_to_invoice; after a
// successful response we fire the sub's notification (notify-gc-response) and
// never let its failure block the GC's confirmation.
//
// Action tokens sent as p_action to gc_respond_to_invoice. Assumed values —
// verify against the live RPC; they are isolated here so a change is one edit.
const ACTION_APPROVE = 'approve'
const ACTION_CHANGES = 'request_changes'

const REFERRAL_URL = 'https://rivetdog.com/?utm_source=gc_portal&utm_medium=web&utm_campaign=gc_referral&utm_content=portal'

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// gc_approval's stored value set is not guaranteed here; normalize defensively.
function isApproved(gcApproval) {
  return String(gcApproval || '').toLowerCase().startsWith('approv')
}

export default function GCInvoiceReviewPage() {
  const { t } = useTranslation()
  const unitLabels = { sf: t('common:units.sf'), lf: t('common:units.lf'), each: t('common:units.each'), hour: t('common:units.hour'), lump_sum: t('common:units.lumpSum') }
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Response flow
  const [showComment, setShowComment] = useState(false)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [done, setDone] = useState(null) // null | 'approve' | 'request_changes'

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

  // Match the client portal's tenant theming (Rules of Hooks: above early returns).
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

  async function respond(action) {
    if (action === ACTION_CHANGES && !comment.trim()) {
      setActionError(t('portal:gcReview.errors.noteRequired'))
      return
    }
    setSubmitting(true)
    setActionError(null)
    try {
      const { data: result, error: rpcErr } = await supabase.rpc('gc_respond_to_invoice', {
        p_token: token,
        p_action: action,
        p_comment: action === ACTION_CHANGES ? comment.trim() : null,
      })
      if (rpcErr) { setActionError(rpcErr.message); return }
      if (result && result.ok === false) {
        setActionError(result.error || result.message || t('portal:gcReview.errors.generic'))
        return
      }
      // Notify the sub — fire-and-forget, never block the GC's confirmation.
      supabase.functions.invoke('notify-gc-response', { body: { token } })
        .catch(err => console.warn('notify-gc-response failed', err))
      setDone(action)
    } catch (err) {
      setActionError(err.message || t('portal:gcReview.errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  function changeResponse() {
    setDone(null)
    setShowComment(false)
    setComment('')
    setActionError(null)
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.loading}>{t('common:misc.loading')}</div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.notFoundTitle}>{t('portal:invoice.notFoundTitle')}</h1>
          <p className={styles.notFoundText}>{t('portal:invoice.notFoundText')}</p>
          <p className={styles.footer}>{t('common:misc.poweredBy')}</p>
        </div>
      </div>
    )
  }

  const inv = data.invoice
  const lineItems = data.line_items || []
  const companyName = data.company_name || t('portal:shared.fallbackContractor')      // the sub — the biller
  const companyPhone = data.company_phone || null                 // not returned by the repo RPC (gap)
  const tenantPrimary = data.company_primary_color || null
  const adjNum = Number(inv.adjustment_amount) || 0
  const canRespond = !['paid', 'void'].includes(inv.status)
  const priorApproval = inv.gc_approval || null                   // only present if the RPC exposes it
  const primaryBtn = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '14px 24px', background: 'var(--color-primary, #f27243)', color: '#fff',
    border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 16, cursor: 'pointer', width: '100%',
  }
  const secondaryBtn = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '13px 24px', background: 'transparent', color: 'var(--color-text)',
    border: '1px solid var(--color-border)', borderRadius: 8, fontWeight: 600, fontSize: 15, cursor: 'pointer', width: '100%',
  }

  return (
    <div className={styles.page}>
      <div className={styles.card} style={tenantPrimary ? { '--color-primary': tenantPrimary } : undefined}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LanguageToggle />
        </div>
        {/* Letterhead — the sub is the biller */}
        <div className={styles.companyHeader}>
          {data.company_logo_url && <img src={data.company_logo_url} alt={t('portal:shared.companyLogoAlt', { name: companyName })} className={styles.companyLogo} />}
          <h2 className={styles.companyName}>{companyName}</h2>
          {companyPhone && <p className={styles.address}>{companyPhone}</p>}
        </div>

        {/* Invoice header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text)' }}>
            {inv.title || t('portal:invoice.defaultTitle')}
          </h1>
          <div style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            {inv.invoice_number} &middot; {t('portal:invoice.issued', { date: fmtDate(inv.created_at) })}
            {inv.due_date && <> &middot; <strong style={{ color: 'var(--color-primary)' }}>{t('portal:invoice.due', { date: fmtDate(inv.due_date) })}</strong></>}
          </div>
          <InvoiceStatusBadge status={inv.status} isOverdue={inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < new Date()} />
        </div>

        {/* Prior response state, if the RPC exposes it */}
        {priorApproval && (
          <div style={{ margin: '0 0 20px', padding: '12px 16px', borderRadius: 8, textAlign: 'center', fontSize: 14, fontWeight: 600,
            background: 'var(--color-surface-2)', color: 'var(--color-text)' }}>
            {isApproved(priorApproval)
              ? t('portal:gcReview.priorApproved')
              : t('portal:gcReview.priorSentBack')}
          </div>
        )}

        {/* Billed to — the GC */}
        {data.client_name && (
          <div className={styles.clientRow}>
            <span className={styles.clientRowLabel}>{t('portal:invoice.billedTo')}</span>
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
                  <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{t('portal:invoice.col.description')}</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>{t('portal:invoice.col.qty')}</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>{t('portal:invoice.col.unit')}</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>{t('portal:invoice.col.rate')}</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' }}>{t('portal:invoice.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={li.id || i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '8px 6px', color: 'var(--color-text)' }}>{li.description}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--color-text-muted)' }}>{Number(li.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{unitLabels[li.unit] || li.unit}</td>
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
            <span>{t('portal:invoice.subtotal')}</span><span>{fmtMoney(inv.subtotal)}</span>
          </div>
          {adjNum !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 220, fontSize: 14, color: 'var(--color-text-muted)' }}>
              <span>{inv.adjustment_label || t('portal:invoice.adjustment')}</span><span>{fmtMoney(adjNum)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', width: 220, fontSize: 18, fontWeight: 700, color: 'var(--color-text)', paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
            <span>{t('portal:invoice.total')}</span><span style={{ fontFamily: 'monospace' }}>{fmtMoney(inv.total)}</span>
          </div>
        </div>

        {/* Notes + Terms */}
        {inv.notes && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-muted)', marginBottom: 6 }}>{t('portal:invoice.notes')}</div>
            <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{inv.notes}</p>
          </div>
        )}
        {inv.terms && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-text-muted)', marginBottom: 6 }}>{t('portal:invoice.terms')}</div>
            <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{inv.terms}</p>
          </div>
        )}

        {/* Payment instructions */}
        <PaymentInstructionsBlock paymentInstructions={data.company_payment_instructions} variant="portal" />

        {/* ── Response actions ─────────────────────────────────────── */}
        {done ? (
          <div style={{ margin: '24px 0 8px', padding: '20px 16px', borderRadius: 10, textAlign: 'center',
            background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-success)', marginBottom: 6 }}>
              {done === ACTION_APPROVE ? t('portal:gcReview.approvedNotified', { name: companyName }) : t('portal:gcReview.sentBack')}
            </div>
            {canRespond && (
              <button onClick={changeResponse} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #f27243)', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
                {t('portal:gcReview.changeResponse')}
              </button>
            )}
          </div>
        ) : canRespond ? (
          <div style={{ margin: '24px 0 8px' }}>
            {showComment ? (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                  {t('portal:gcReview.whatNeedsToChange')}
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder={t('portal:gcReview.notePlaceholder')}
                  rows={4}
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 15, fontFamily: 'inherit',
                    border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  <button onClick={() => respond(ACTION_CHANGES)} disabled={submitting} style={primaryBtn}>
                    {submitting ? t('portal:gcReview.sending') : t('portal:gcReview.sendBackWithNote')}
                  </button>
                  <button onClick={() => { setShowComment(false); setActionError(null) }} disabled={submitting} style={secondaryBtn}>
                    {t('common:action.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button onClick={() => respond(ACTION_APPROVE)} disabled={submitting} style={primaryBtn}>
                  <CheckCircle size={18} /> {submitting ? t('portal:gcReview.working') : t('portal:gcReview.approve')}
                </button>
                <button onClick={() => { setShowComment(true); setActionError(null) }} disabled={submitting} style={secondaryBtn}>
                  <MessageSquare size={16} /> {t('portal:gcReview.requestChanges')}
                </button>
              </div>
            )}
            {actionError && (
              <p style={{ fontSize: 13, color: 'var(--color-danger)', marginTop: 10, textAlign: 'center' }}>{actionError}</p>
            )}
          </div>
        ) : null}

        {/* ── Referral card — the viral surface ────────────────────── */}
        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 28, paddingTop: 28 }}>
          <div style={{ background: '#1B2426', borderRadius: 12, padding: '32px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, lineHeight: 1, fontWeight: 800, letterSpacing: '0.5px', color: '#F27243', fontFamily: "'Telegraf', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>RivetDog</div>
            <h2 style={{ fontSize: 21, lineHeight: 1.3, color: '#ffffff', fontWeight: 700, margin: '20px 0 12px' }}>
              {t('portal:gcReview.referral.heading')}
            </h2>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: '#b8c0c2', margin: '0 0 24px' }}>
              {t('portal:gcReview.referral.subtext')}
            </p>
            <a href={REFERRAL_URL} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', background: '#F27243', color: '#ffffff', fontSize: 15, fontWeight: 600, textDecoration: 'none', padding: '13px 28px', borderRadius: 8 }}>
              {t('portal:gcReview.referral.cta')}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
