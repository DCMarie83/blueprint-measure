import { useState, useMemo } from 'react'
import { Send, AlertCircle } from 'lucide-react'
import Modal from '../ui/Modal'
import { generateEstimatePDF } from '../../lib/generateEstimatePDF'
import { supabase } from '../../lib/supabase'
import styles from './SendEstimateModal.module.css'

const VARIANT_OPTIONS = [
  { key: 'good', label: 'Good', totalField: 'good_total' },
  { key: 'better', label: 'Better', totalField: 'better_total' },
  { key: 'best', label: 'Best', totalField: 'best_total' },
]

function fmtMoney(val) {
  if (val == null) return '$0.00'
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function SendEstimateModal({ estimate, lineItems, project, client, company, onClose, onSent }) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState(null)

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
      // Generate single-variant PDF as base64
      const pdfBase64 = generateEstimatePDF({
        estimate,
        lineItems,
        project,
        client,
        company,
        variant: selectedVariant,
        returnAs: 'base64',
      })

      // Call Edge Function with selected variant
      const { data, error: fnErr } = await supabase.functions.invoke('send-estimate-email', {
        body: { estimate_id: estimate.id, pdf_base64: pdfBase64, selected_variant: selectedVariant },
      })

      if (fnErr) throw new Error(fnErr.message || 'Failed to send estimate')
      if (data?.error) throw new Error(data.error)

      onSent()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title="Send Estimate to Client" onClose={onClose}>
      {!client ? (
        <div className={styles.errorBlock}>
          <AlertCircle size={18} />
          <span>No client linked to this project. Link a client first.</span>
        </div>
      ) : !hasRecipients ? (
        <div className={styles.errorBlock}>
          <AlertCircle size={18} />
          <span>No email on file for {client.display_name}. Add a primary email to the client first.</span>
        </div>
      ) : (
        <>
          <p className={styles.confirmText}>
            Send <strong>{estimate.title || estimate.estimate_number}</strong> to <strong>{client.display_name}</strong>?
          </p>

          {/* Variant selector */}
          <p className={styles.variantHelper}>Choose which tier to send to {client.display_name}</p>
          <div className={styles.variantPicker}>
            {VARIANT_OPTIONS.map(v => (
              <button
                key={v.key}
                className={`${styles.variantPill} ${selectedVariant === v.key ? styles.variantPillActive : ''}`}
                onClick={() => setSelectedVariant(v.key)}
                type="button"
              >
                <span className={styles.variantLabel}>{v.label}</span>
                <span className={styles.variantAmount}>{fmtMoney(estimate[v.totalField])}</span>
              </button>
            ))}
          </div>

          <div className={styles.recipientList}>
            <span className={styles.recipientLabel}>Recipients:</span>
            {recipients.map(email => (
              <span key={email} className={styles.recipientEmail}>{email}</span>
            ))}
          </div>

          <p className={styles.note}>PDF attached + portal link included in email.</p>

          {error && (
            <div className={styles.errorBlock}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={onClose} disabled={sending}>Cancel</button>
            <button className={styles.sendBtn} onClick={handleSend} disabled={sending || !selectedVariant}>
              <Send size={15} /> {sending ? 'Sending...' : 'Send Estimate'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
