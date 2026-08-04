import { useState, useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Send, AlertCircle } from 'lucide-react'
import Modal from '../ui/Modal'
import { generateEstimatePDF } from '../../lib/generateEstimatePDF'
import { getDisplayTotal } from '../../lib/estimateDisplay'
import { supabase } from '../../lib/supabase'
import { snapshotEstimateOnSend } from '../../lib/smartBid'
import { trackMaterials } from '../../lib/analytics'
import styles from './SendEstimateModal.module.css'

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function SendEstimateModal({ estimate, lineItems, project, client, company, onClose, onSent }) {
  const { t } = useTranslation()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const recipients = useMemo(() => {
    if (!client) return []
    const flagged = (client.client_contacts ?? [])
      .filter(c => c.is_portal_recipient && c.email)
      .map(c => c.email)
    const fallback = client.primary_email ? [client.primary_email] : []
    return Array.from(new Set([...flagged, ...fallback]))
  }, [client])

  const hasRecipients = recipients.length > 0

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const pdfBase64 = generateEstimatePDF({
        estimate,
        lineItems,
        project,
        client,
        company,
        returnAs: 'base64',
      })

      const { data, error: fnErr } = await supabase.functions.invoke('send-estimate-email', {
        body: { estimate_id: estimate.id, pdf_base64: pdfBase64 },
      })

      if (fnErr) throw new Error(fnErr.message || t('estimates:send.sendFailed'))
      if (data?.error) throw new Error(data.error)

      // Send-time market-position snapshot for Smart / benchmark-priced estimates.
      // Never blocks or fails the send: catch, warn, continue.
      try {
        const snap = await snapshotEstimateOnSend(supabase, { estimate, lineItems, companyState: company?.state })
        if (snap) {
          trackMaterials('smart_bid_sent_snapshot', {
            companyId: company?.id,
            entityType: 'estimate',
            entityId: estimate.id,
            surface: 'estimates',
            bid_position: snap.bid_position,
          })
        }
      } catch (snapErr) {
        console.warn('[smart-bid] send snapshot failed:', snapErr?.message || snapErr)
      }

      onSent()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title={t('estimates:send.title')} onClose={onClose}>
      {!client ? (
        <div className={styles.errorBlock}>
          <AlertCircle size={18} />
          <span>{t('estimates:send.noClient')}</span>
        </div>
      ) : !hasRecipients ? (
        <div className={styles.errorBlock}>
          <AlertCircle size={18} />
          <span>{t('estimates:send.noEmail', { name: client.display_name })}</span>
        </div>
      ) : (
        <>
          <p className={styles.confirmText}>
            <Trans
              i18nKey="estimates:send.confirm"
              components={{ b: <strong /> }}
              values={{
                subject: estimate.title || estimate.estimate_number,
                total: fmtMoney(getDisplayTotal(estimate)),
                client: client.display_name,
              }}
            />
          </p>

          <div className={styles.recipientList}>
            <span className={styles.recipientLabel}>{t('estimates:send.recipients')}</span>
            {recipients.map(email => (
              <span key={email} className={styles.recipientEmail}>{email}</span>
            ))}
          </div>

          <p className={styles.note}>{t('estimates:send.pdfNote')}</p>

          {error && (
            <div className={styles.errorBlock}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onClose} disabled={sending}>{t('common:action.cancel')}</button>
            <button className={styles.sendBtn} onClick={handleSend} disabled={sending}>
              <Send size={15} /> {sending ? t('estimates:send.sending') : t('estimates:send.sendEstimate')}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
