import { useState } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import styles from './PortalEstimateSection.module.css'

const VARIANTS = [
  { key: 'good', label: 'Good', rateField: 'rate_good', totalField: 'total_good', grandTotal: 'good_total' },
  { key: 'better', label: 'Better', rateField: 'rate_better', totalField: 'total_better', grandTotal: 'better_total' },
  { key: 'best', label: 'Best', rateField: 'rate_best', totalField: 'total_best', grandTotal: 'best_total' },
]

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
  // If contractor selected a specific variant, lock to it (no tabs)
  const lockedVariant = estimate.selected_variant || null
  const [selectedVariant, setSelectedVariant] = useState(lockedVariant || 'best')
  const [showAccept, setShowAccept] = useState(false)
  const [showDecline, setShowDecline] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [acceptChecked, setAcceptChecked] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [responseStatus, setResponseStatus] = useState(estimate.status)

  const variant = VARIANTS.find(v => v.key === selectedVariant) || VARIANTS[2]
  const variantTotal = fmtMoney(estimate[variant.grandTotal])

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
      })
      if (rpcErr) throw rpcErr
      setResponseStatus('accepted')
      setShowAccept(false)

      // Notify contractor (fire-and-forget)
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

      // Notify contractor (fire-and-forget)
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

      {/* Variant tabs or single-variant heading */}
      {lockedVariant ? (
        <div className={styles.singleVariantHeader}>
          <span className={styles.singleVariantLabel}>{estimate.title || 'Project Estimate'}</span>
          <span className={styles.singleVariantTotal}>{variantTotal}</span>
        </div>
      ) : (
        <div className={styles.variantTabs}>
          {VARIANTS.map(v => (
            <button
              key={v.key}
              className={`${styles.variantTab} ${selectedVariant === v.key ? styles.variantTabActive : ''}`}
              onClick={() => setSelectedVariant(v.key)}
            >
              {v.label}
              <span className={styles.variantTotal}>{fmtMoney(estimate[v.grandTotal])}</span>
            </button>
          ))}
        </div>
      )}

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
                <div className={styles.lineRate}>{fmtMoney(li[variant.rateField])}</div>
                <div className={styles.lineTotal}>{fmtMoney(li[variant.totalField])}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Total */}
      <div className={styles.grandTotal}>
        <span>{lockedVariant ? 'Total' : `${variant.label} Total`}</span>
        <span className={styles.grandTotalValue}>{variantTotal}</span>
      </div>

      {/* Notes */}
      {estimate.notes && (
        <div className={styles.notes}>
          <strong>Notes:</strong> {estimate.notes}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={styles.errorBlock}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Accept / Decline buttons */}
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

      {/* Accept form */}
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
              I, <strong>{typedName}</strong>, accept this estimate totaling <strong>{variantTotal}</strong>.
            </p>
          )}
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={acceptChecked}
              onChange={e => setAcceptChecked(e.target.checked)}
            />
            <span>I understand this constitutes acceptance of the estimate</span>
          </label>
          <div className={styles.formActions}>
            <button className={styles.cancelFormBtn} onClick={() => { setShowAccept(false); setTypedName(''); setAcceptChecked(false) }}>Cancel</button>
            <button
              className={styles.confirmAcceptBtn}
              onClick={handleAccept}
              disabled={!typedName.trim() || !acceptChecked || submitting}
            >
              {submitting ? 'Submitting...' : 'Confirm Acceptance'}
            </button>
          </div>
        </div>
      )}

      {/* Decline form */}
      {showDecline && (
        <div className={styles.responseForm}>
          <h3 className={styles.formTitle}>Decline Estimate</h3>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Reason (optional)</label>
            <textarea
              className={styles.fieldTextarea}
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              placeholder="Let the contractor know why..."
              rows={3}
            />
          </div>
          <div className={styles.formActions}>
            <button className={styles.cancelFormBtn} onClick={() => { setShowDecline(false); setDeclineReason('') }}>Cancel</button>
            <button
              className={styles.confirmDeclineBtn}
              onClick={handleDecline}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Confirm Decline'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
