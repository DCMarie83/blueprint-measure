import { useState, useMemo } from 'react'
import { Send, AlertCircle } from 'lucide-react'
import Modal from '../ui/Modal'
import { generateEstimatePDF } from '../../lib/generateEstimatePDF'
import { supabase } from '../../lib/supabase'
import styles from './SendEstimateModal.module.css'

export default function SendEstimateModal({ estimate, lineItems, project, client, company, onClose, onSent }) {
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
      // Generate PDF as base64
      const pdfBase64 = generateEstimatePDF({
        estimate,
        lineItems,
        project,
        client,
        company,
        returnAs: 'base64',
      })

      // Call Edge Function
      const { data, error: fnErr } = await supabase.functions.invoke('send-estimate-email', {
        body: { estimate_id: estimate.id, pdf_base64: pdfBase64 },
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
            <button className={styles.sendBtn} onClick={handleSend} disabled={sending}>
              <Send size={15} /> {sending ? 'Sending...' : 'Send Estimate'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
