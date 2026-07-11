import { useState } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getDisplayVariant, getDisplayTotal, getDisplayRate, getDisplayLineTotal } from '../../lib/estimateDisplay'
import styles from './PortalEstimateSection.module.css'

const UNIT_LABELS = { sf: 'SF', lf: 'LF', each: 'Each', hour: 'Hour', lump_sum: 'Lump Sum' }

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function PortalEstimateSection({ estimate, lineItems, portalToken }) {
  const [showAccept, setShowAccept] = useState(false)
  const [showDecline, setShowDecline] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [acceptChecked, setAcceptChecked] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [responseStatus, setResponseStatus] = useState(estimate.status)

  const displayTotal = fmtMoney(getDisplayTotal(estimate))

  // Group line items by category
  const groups = []
  const catMap = {}
  const catOrder = []
  for (const li of lineItems) {
    const cat = li.category_name || 'General'
    if (!catMap[cat]) { catMap[cat] = []; catOrder.push(cat) }
    catMap[cat].push(li)
  }
  for (const cat of catOrder) {
    groups.push({ category: cat, items: catMap[cat] })
  }

  async function handleAccept() {
    setSubmitting(true)
    setError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('accept_estimate', {
        p_estimate_id: estimate.id,
        p_portal_token: portalToken,
        p_typed_name: typedName,
        p_accepted_variant: null,
      })
      if (rpcErr) throw rpcErr
      setResponseStatus('accepted')
      setShowAccept(false)

      supabase.functions.invoke('notify-estimate-response', {
        body: { estimate_id: estimate.id },
      }).catch(() => {})
    } catch (err) {
      setError(err.message || 'Failed to accept estimate')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDecline() {
    setSubmitting(true)
    setError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('decline_estimate', {
        p_estimate_id: estimate.id,
        p_portal_token: portalToken,
        p_reason: declineReason || null,
      })
      if (rpcErr) throw rpcErr
      setResponseStatus('declined')
      setShowDecline(false)

      supabase.functions.invoke('notify-estimate-response', {
        body: { estimate_id: estimate.id },
      }).catch(() => {})
    } catch (err) {
      setError(err.message || 'Failed to decline estimate')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.section}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>{estimate.title || 'Estimate'}</h2>
        <div className={styles.meta}>
          <span className={styles.estNumber}>{estimate.estimate_number}</span>
          {estimate.sent_at && <span className={styles.date}>Issued {fmtDate(estimate.sent_at)}</span>}
          {estimate.expires_at && <span className={styles.date}>Expires {fmtDate(estimate.expires_at)}</span>}
        </div>
      </div>

      {/* Status banners */}
      {responseStatus === 'accepted' && (
        <div className={styles.acceptedBanner}>
          <Check size={18} /> Accepted on {fmtDate(estimate.accepted_at || new Date().toISOString())}
        </div>
      )}
      {responseStatus === 'declined' && (
        <div className={styles.declinedBanner}>
          <X size={18} /> Declined on {fmtDate(estimate.declined_at || new Date().toISOString())}
          {estimate.decline_reason && (
            <div className={styles.declineReason}>{estimate.decline_reason}</div>
          )}
        </div>
      )}

      {/* Single-price heading */}
      <div className={styles.singleVariantHeader}>
        <span className={styles.singleVariantLabel}>{estimate.title || 'Project Estimate'}</span>
        <span className={styles.singleVariantTotal}>{displayTotal}</span>
      </div>

      {/* Line items */}
      <div className={styles.lineItems}>
        {groups.map(({ category, items }) => (
          <div key={category}>
            <div className={styles.catHeader}>{category}</div>
            {items.map(li => (
              <div key={li.id} className={styles.lineRow}>
                <div className={styles.lineDesc}>
                  <span>{li.description}</span>
                  {li.source_zone_name && (
                    <span className={styles.zoneBadge}>{li.source_zone_name}</span>
                  )}
                </div>
                <div className={styles.lineQty}>
                  {Number(li.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {UNIT_LABELS[li.unit] || li.unit}
                </div>
                <div className={styles.lineRate}>{fmtMoney(getDisplayRate(li, estimate))}</div>
                <div className={styles.lineTotal}>{fmtMoney(getDisplayLineTotal(li, estimate))}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Total */}
      <div className={styles.grandTotal}>
        <span>Total</span>
        <span className={styles.grandTotalValue}>{displayTotal}</span>
      </div>

      {/* Notes / Deposit / Terms */}
      {(estimate.notes || estimate.deposit_amount || estimate.terms) && (
        <div className={styles.detailsBlock}>
          {estimate.notes && estimate.notes.trim() && (
            <div className={styles.detailSection}>
              <h4 className={styles.detailHeader}>Notes</h4>
              <p className={styles.detailBody}>{estimate.notes}</p>
            </div>
          )}
          {estimate.deposit_amount != null && Number(estimate.deposit_amount) > 0 && (() => {
            const refTotal = getDisplayTotal(estimate)
            const dep = Number(estimate.deposit_amount)
            const pct = (refTotal > 0 && dep > 0) ? Math.round((dep / refTotal) * 100) : null
            const depFmt = `$${dep.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            return (
              <div className={styles.detailSection}>
                <h4 className={styles.detailHeader}>Deposit Required</h4>
                <p className={styles.detailBody}>
                  <span className={styles.depositAmount}>{depFmt}</span>
                  {pct != null && <span className={styles.depositPct}> ({pct}%)</span>}
                </p>
              </div>
            )
          })()}
          {estimate.terms && estimate.terms.trim() && (
            <div className={styles.detailSection}>
              <h4 className={styles.detailHeader}>Terms &amp; Conditions</h4>
              <p className={styles.detailBody}>{estimate.terms}</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className={styles.errorBlock}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {responseStatus === 'sent' && !showAccept && !showDecline && (
        <div className={styles.actionRow}>
          <button className={styles.acceptBtn} onClick={() => setShowAccept(true)}>
            <Check size={16} /> Accept Estimate
          </button>
          <button className={styles.declineBtn} onClick={() => setShowDecline(true)}>
            <X size={16} /> Decline
          </button>
        </div>
      )}

      {showAccept && (
        <div className={styles.responseForm}>
          <h3 className={styles.formTitle}>Accept Estimate</h3>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Your Name</label>
            <input
              className={styles.fieldInput}
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              placeholder="Type your full name"
              autoFocus
            />
          </div>
          {typedName.trim() && (
            <p className={styles.confirmText}>
              I, <strong>{typedName}</strong>, accept this estimate totaling <strong>{displayTotal}</strong>.
            </p>
          )}
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={acceptChecked} onChange={e => setAcceptChecked(e.target.checked)} />
            <span>I understand this constitutes acceptance of the estimate</span>
          </label>
          <div className={styles.formActions}>
            <button className={styles.cancelFormBtn} onClick={() => { setShowAccept(false); setTypedName(''); setAcceptChecked(false) }}>Cancel</button>
            <button className={styles.confirmAcceptBtn} onClick={handleAccept} disabled={!typedName.trim() || !acceptChecked || submitting}>
              {submitting ? 'Submitting...' : 'Confirm Acceptance'}
            </button>
          </div>
        </div>
      )}

      {showDecline && (
        <div className={styles.responseForm}>
          <h3 className={styles.formTitle}>Decline Estimate</h3>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Reason (optional)</label>
            <textarea className={styles.fieldTextarea} value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="Let the contractor know why..." rows={3} />
          </div>
          <div className={styles.formActions}>
            <button className={styles.cancelFormBtn} onClick={() => { setShowDecline(false); setDeclineReason('') }}>Cancel</button>
            <button className={styles.confirmDeclineBtn} onClick={handleDecline} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Confirm Decline'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
