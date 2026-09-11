import { useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Check, X, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getDisplayVariant, getDisplayTotal, getDisplayRate, getDisplayLineTotal } from '../../lib/estimateDisplay'
import styles from './PortalEstimateSection.module.css'

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// One estimate, rendered exactly as the single-estimate section always has:
// banners, lines, deposit, notes, and its own Accept / Decline / Request
// changes when its status is sent.
function EstimateEntry({ estimate, lineItems, portalToken, companyName }) {
  const { t } = useTranslation()
  const unitLabels = { sf: t('common:units.sf'), lf: t('common:units.lf'), each: t('common:units.each'), hour: t('common:units.hour'), lump_sum: t('common:units.lumpSum') }
  const [showAccept, setShowAccept] = useState(false)
  const [showDecline, setShowDecline] = useState(false)
  const [showChanges, setShowChanges] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [acceptChecked, setAcceptChecked] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [changeComment, setChangeComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [responseStatus, setResponseStatus] = useState(estimate.status)

  const displayTotal = fmtMoney(getDisplayTotal(estimate))

  // Group line items by section. A section is a non-empty trimmed
  // category_name; unnamed lines render first with no header.
  const catMap = {}
  const catOrder = []
  for (const li of lineItems) {
    const cat = (li.category_name || '').trim()
    if (!catMap[cat]) { catMap[cat] = []; catOrder.push(cat) }
    catMap[cat].push(li)
  }
  const groups = catOrder
    .filter(c => c === '')
    .concat(catOrder.filter(c => c !== ''))
    .map(cat => ({ category: cat, items: catMap[cat] }))

  // The contractor notification is the only signal the response was heard:
  // retry the invoke once before giving up (in-app dashboard is the backstop).
  async function invokeNotify() {
    try {
      const { error: fnErr } = await supabase.functions.invoke('notify-estimate-response', {
        body: { estimate_id: estimate.id },
      })
      if (!fnErr) return
    } catch { /* fall through to retry */ }
    try {
      await supabase.functions.invoke('notify-estimate-response', {
        body: { estimate_id: estimate.id },
      })
    } catch { /* the dashboard Client responses widget still surfaces it */ }
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

      invokeNotify()
    } catch (err) {
      setError(err.message || t('portal:estimate.errors.acceptFailed'))
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

      invokeNotify()
    } catch (err) {
      setError(err.message || t('portal:estimate.errors.declineFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestChanges() {
    setSubmitting(true)
    setError(null)
    try {
      const { data, error: rpcErr } = await supabase.rpc('request_estimate_changes', {
        p_estimate_id: estimate.id,
        p_portal_token: portalToken,
        p_comment: changeComment,
      })
      if (rpcErr) throw rpcErr
      setResponseStatus('changes_requested')
      setShowChanges(false)

      invokeNotify()
    } catch (err) {
      setError(err.message || t('portal:estimate.errors.requestFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.section}>
      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>{estimate.title || t('portal:estimate.defaultTitle')}</h2>
        <div className={styles.meta}>
          <span className={styles.estNumber}>{estimate.estimate_number}</span>
          {estimate.sent_at && <span className={styles.date}>{t('portal:estimate.issued', { date: fmtDate(estimate.sent_at) })}</span>}
          {estimate.expires_at && <span className={styles.date}>{t('portal:estimate.expires', { date: fmtDate(estimate.expires_at) })}</span>}
        </div>
      </div>

      {/* Status banners */}
      {responseStatus === 'accepted' && (
        <div className={styles.acceptedBanner}>
          <Check size={18} />
          <span>
            {t('portal:estimate.acceptedOn', { date: fmtDate(estimate.accepted_at || new Date().toISOString()) })}
            {estimate.accepted_by_name && <> {t('portal:estimate.acceptedBy', { name: estimate.accepted_by_name })}</>}
          </span>
        </div>
      )}
      {responseStatus === 'declined' && (
        <div className={styles.declinedBanner}>
          <X size={18} /> {t('portal:estimate.declinedOn', { date: fmtDate(estimate.declined_at || new Date().toISOString()) })}
          {estimate.decline_reason && (
            <div className={styles.declineReason}>{estimate.decline_reason}</div>
          )}
        </div>
      )}
      {responseStatus === 'changes_requested' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: '12px 16px', margin: '12px 0', fontSize: 14, color: '#1b2426', lineHeight: 1.5 }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div>{t('portal:estimate.changesRequestedRevising', {
              date: fmtDate(estimate.changes_requested_at || new Date().toISOString()),
              company: companyName || t('portal:estimate.yourContractor'),
            })}</div>
            {(estimate.change_request_comment || changeComment) && (
              <div style={{ marginTop: 6, fontStyle: 'italic', color: '#555' }}>{estimate.change_request_comment || changeComment}</div>
            )}
          </div>
        </div>
      )}

      {/* Single-price heading */}
      <div className={styles.singleVariantHeader}>
        <span className={styles.singleVariantLabel}>{estimate.title || t('portal:estimate.projectEstimate')}</span>
        <span className={styles.singleVariantTotal}>{displayTotal}</span>
      </div>

      {/* Line items */}
      <div className={styles.lineItems}>
        {groups.map(({ category, items }) => (
          <div key={category || '__no-section'}>
            {category !== '' && <div className={styles.catHeader}>{category}</div>}
            {items.map(li => (
              <div key={li.id} className={styles.lineRow}>
                <div className={styles.lineDesc}>
                  <span>{li.description}</span>
                  {li.source_zone_name && (
                    <span className={styles.zoneBadge}>{li.source_zone_name}</span>
                  )}
                </div>
                <div className={styles.lineQty}>
                  {Number(li.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {unitLabels[li.unit] || li.unit}
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
        <span>{t('portal:estimate.total')}</span>
        <span className={styles.grandTotalValue}>{displayTotal}</span>
      </div>

      {/* Notes / Deposit / Terms */}
      {(estimate.notes || estimate.deposit_amount || estimate.terms) && (
        <div className={styles.detailsBlock}>
          {estimate.notes && estimate.notes.trim() && (
            <div className={styles.detailSection}>
              <h4 className={styles.detailHeader}>{t('portal:estimate.notes')}</h4>
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
                <h4 className={styles.detailHeader}>{t('portal:estimate.depositRequired')}</h4>
                <p className={styles.detailBody}>
                  <span className={styles.depositAmount}>{depFmt}</span>
                  {pct != null && <span className={styles.depositPct}> ({pct}%)</span>}
                </p>
              </div>
            )
          })()}
          {estimate.terms && estimate.terms.trim() && (
            <div className={styles.detailSection}>
              <h4 className={styles.detailHeader}>{t('portal:estimate.termsConditions')}</h4>
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

      {responseStatus === 'sent' && !showAccept && !showDecline && !showChanges && (
        <div className={styles.actionRow}>
          <button className={styles.acceptBtn} onClick={() => setShowAccept(true)}>
            <Check size={16} /> {t('portal:estimate.acceptEstimate')}
          </button>
          <button className={styles.declineBtn} onClick={() => setShowChanges(true)}>
            {t('portal:estimate.requestChanges')}
          </button>
          <button className={styles.declineBtn} onClick={() => setShowDecline(true)}>
            <X size={16} /> {t('portal:estimate.decline')}
          </button>
        </div>
      )}

      {showAccept && (
        <div className={styles.responseForm}>
          <h3 className={styles.formTitle}>{t('portal:estimate.acceptEstimate')}</h3>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('portal:estimate.yourName')}</label>
            <input
              className={styles.fieldInput}
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              placeholder={t('portal:estimate.namePlaceholder')}
              autoFocus
            />
          </div>
          {typedName.trim() && (
            <p className={styles.confirmText}>
              <Trans i18nKey="portal:estimate.acceptConfirm" values={{ name: typedName, total: displayTotal }}>
                I, <strong>{'{{name}}'}</strong>, accept this estimate totaling <strong>{'{{total}}'}</strong>.
              </Trans>
            </p>
          )}
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={acceptChecked} onChange={e => setAcceptChecked(e.target.checked)} />
            <span>{t('portal:estimate.acceptCheckbox')}</span>
          </label>
          <div className={styles.formActions}>
            <button className={styles.cancelFormBtn} onClick={() => { setShowAccept(false); setTypedName(''); setAcceptChecked(false) }}>{t('common:action.cancel')}</button>
            <button className={styles.confirmAcceptBtn} onClick={handleAccept} disabled={!typedName.trim() || !acceptChecked || submitting}>
              {submitting ? t('portal:estimate.submitting') : t('portal:estimate.confirmAcceptance')}
            </button>
          </div>
        </div>
      )}

      {showDecline && (
        <div className={styles.responseForm}>
          <h3 className={styles.formTitle}>{t('portal:estimate.declineEstimate')}</h3>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('portal:estimate.reasonOptional')}</label>
            <textarea className={styles.fieldTextarea} value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder={t('portal:estimate.declinePlaceholder')} rows={3} />
          </div>
          <div className={styles.formActions}>
            <button className={styles.cancelFormBtn} onClick={() => { setShowDecline(false); setDeclineReason('') }}>{t('common:action.cancel')}</button>
            <button className={styles.confirmDeclineBtn} onClick={handleDecline} disabled={submitting}>
              {submitting ? t('portal:estimate.submitting') : t('portal:estimate.confirmDecline')}
            </button>
          </div>
        </div>
      )}

      {showChanges && (
        <div className={styles.responseForm}>
          <h3 className={styles.formTitle}>{t('portal:estimate.requestChangesTitle')}</h3>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>{t('portal:estimate.whatChanged')}</label>
            <textarea className={styles.fieldTextarea} value={changeComment} onChange={e => setChangeComment(e.target.value)} placeholder={t('portal:estimate.changesPlaceholder')} rows={4} autoFocus />
          </div>
          <div className={styles.formActions}>
            <button className={styles.cancelFormBtn} onClick={() => { setShowChanges(false); setChangeComment('') }}>{t('common:action.cancel')}</button>
            <button className={styles.confirmDeclineBtn} onClick={handleRequestChanges} disabled={!changeComment.trim() || submitting}>
              {submitting ? t('portal:estimate.submitting') : t('portal:estimate.sendRequest')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


// The portal lists every estimate on the job (newest first, from
// get_portal_estimate's `estimates` array). The newest renders expanded; the
// rest collapse to number, date, amount, and a status pill. A job with one
// estimate looks exactly as it always has.
export default function PortalEstimateSection({ estimate, lineItems, estimates, portalToken, companyName }) {
  const { t } = useTranslation()
  const list = (estimates?.length ? estimates : (estimate ? [{ ...estimate, line_items: lineItems }] : []))
  const [openId, setOpenId] = useState(list[0]?.id ?? null)
  if (list.length === 0) return null
  if (list.length === 1) {
    return <EstimateEntry estimate={list[0]} lineItems={list[0].line_items || lineItems || []} portalToken={portalToken} companyName={companyName} />
  }

  const pill = (est) => {
    if (est.status === 'accepted') return { text: t('portal:estimate.pillAccepted'), bg: 'rgba(22,163,74,0.12)', color: '#16a34a' }
    if (est.status === 'declined') return { text: t('portal:estimate.pillDeclined'), bg: 'rgba(220,38,38,0.1)', color: '#dc2626' }
    if (est.status === 'changes_requested') return { text: t('portal:estimate.pillChanges'), bg: 'rgba(242,114,67,0.14)', color: '#f27243' }
    return { text: t('portal:estimate.pillSent'), bg: 'rgba(0,0,0,0.06)', color: '#555' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {list.map(est => {
        if (openId === est.id) {
          return (
            <EstimateEntry
              key={est.id}
              estimate={est}
              lineItems={est.line_items || []}
              portalToken={portalToken}
              companyName={companyName}
            />
          )
        }
        const p = pill(est)
        return (
          <button
            key={est.id}
            onClick={() => setOpenId(est.id)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', textAlign: 'left', padding: '14px 18px', background: 'var(--color-surface, #fff)', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 12, cursor: 'pointer' }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text, #1b2426)' }}>{est.title || est.estimate_number}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted, #777)' }}>
                {est.estimate_number}{(est.sent_at || est.created_at) ? ` · ${fmtDate(est.sent_at || est.created_at)}` : ''}
              </span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text, #1b2426)' }}>{fmtMoney(getDisplayTotal(est))}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: p.bg, color: p.color }}>{p.text}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
