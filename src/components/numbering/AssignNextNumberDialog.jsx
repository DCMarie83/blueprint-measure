import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal, { ModalFooter } from '../ui/Modal'
import { previewNextNumber } from '../../data/numbering'

// Confirm step for "Assign next number" on invoice and estimate detail. The
// number shown is a read-only preview (nothing is reserved until Confirm);
// onConfirm does the draw and the write and may throw to show an error here.
export default function AssignNextNumberDialog({ kind, companyId, oldNumber, onConfirm, onClose }) {
  const { t } = useTranslation()
  const [next, setNext] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    previewNextNumber(companyId, kind)
      .then(n => { if (!cancelled) setNext(n) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [companyId, kind])

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const canConfirm = !!next && !busy

  return (
    <Modal title={t('shared:numbering.assignNext')} onClose={onClose}>
      <p style={{ fontSize: 14, margin: 0 }}>
        {next
          ? t(kind === 'estimate' ? 'shared:numbering.confirmEstimate' : 'shared:numbering.confirmInvoice', { next, old: oldNumber })
          : !error && t('shared:numbering.loadingNext')}
      </p>
      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--color-danger-bg, #fee2e2)', border: '1px solid var(--color-danger-border, #fecaca)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger, #dc2626)', fontSize: 13 }}>
          {error}
        </div>
      )}
      <ModalFooter>
        <button type="button" onClick={onClose} style={{ padding: '8px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {t('common:action.cancel')}
        </button>
        <button type="button" onClick={handleConfirm} disabled={!canConfirm} style={{ padding: '8px 18px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5 }}>
          {busy ? t('shared:numbering.assigning') : t('shared:numbering.confirmBtn')}
        </button>
      </ModalFooter>
    </Modal>
  )
}
