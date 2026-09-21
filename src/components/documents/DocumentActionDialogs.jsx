import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Modal, { ModalFooter } from '../ui/Modal'
import RecordPicker, { useRecordOptions } from './RecordPicker'
import {
  moveDocument, deleteDocument, describeRecord, isSolePaymentProof, countOtherFileUses, DOCUMENT_ERROR,
} from '../../data/documentActions'

// Dialogs behind the Documents section's admin actions. Both are explicit,
// labeled actions; nothing is sent to anyone.

const btnSecondary = { padding: '8px 18px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const errorBox = { marginTop: 12, padding: '8px 12px', background: 'var(--color-danger-bg, #fee2e2)', border: '1px solid var(--color-danger-border, #fecaca)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger, #dc2626)', fontSize: 13 }
const fileName = (doc) => doc.original_filename || doc.bucket_path.split('/').pop()

function errorText(err, t) {
  if (err.code === DOCUMENT_ERROR.SOLE_PAYMENT_PROOF) return t('shared:documents.actions.refuseSoleProof')
  if (err.code === DOCUMENT_ERROR.STORAGE_DENIED) return t('shared:documents.actions.storageDenied')
  if (err.code === DOCUMENT_ERROR.NOT_FOUND) return t('shared:documents.actions.notFound')
  return err.message
}

// "Move to another record": the attach-mode record picker, then a re-point of
// linked_type / linked_id. The record the document is already on is hidden.
export function MoveDocumentDialog({ doc, companyId, userId, onClose, onDone }) {
  const { t } = useTranslation()
  const records = useRecordOptions(companyId)
  const [target, setTarget] = useState({ recordType: doc.linked_type === 'import_batch' ? 'invoice' : (doc.linked_type || 'invoice'), recordId: '', search: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const canConfirm = !!target.recordId && !busy

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await moveDocument({ companyId, userId, documentId: doc.id, targetType: target.recordType, targetId: target.recordId })
      await onDone?.()
      onClose()
    } catch (err) {
      setError(errorText(err, t))
      setBusy(false)
    }
  }

  return (
    <Modal title={t('shared:documents.actions.move')} onClose={onClose}>
      <p style={{ fontSize: 14, margin: '0 0 12px' }}>{t('shared:documents.actions.moveIntro', { name: fileName(doc) })}</p>
      {records === null ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>{t('common:misc.loading')}</p>
      ) : (
        <RecordPicker
          records={records}
          value={target}
          onChange={patch => setTarget(prev => ({ ...prev, ...patch }))}
          excludeId={target.recordType === doc.linked_type ? doc.linked_id : null}
        />
      )}
      {error && <div style={errorBox}>{error}</div>}
      <ModalFooter>
        <button type="button" onClick={onClose} style={btnSecondary}>{t('common:action.cancel')}</button>
        <button type="button" onClick={handleConfirm} disabled={!canConfirm} style={{ padding: '8px 18px', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5 }}>
          {busy ? t('shared:documents.actions.moving') : t('shared:documents.actions.moveConfirm')}
        </button>
      </ModalFooter>
    </Modal>
  )
}

// "Delete": names the file and the record, says whether the file itself goes
// (it stays when other records share it), and explains the one refusal before
// the button can be pressed. deleteDocument enforces all of it again.
export function DeleteDocumentDialog({ doc, companyId, userId, onClose, onDone }) {
  const { t } = useTranslation()
  const [facts, setFacts] = useState(null) // { record, refused, otherUses }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const record = await describeRecord(companyId, doc.linked_type, doc.linked_id)
        const [refused, otherUses] = await Promise.all([
          isSolePaymentProof(companyId, doc, record),
          countOtherFileUses(companyId, doc),
        ])
        if (!cancelled) setFacts({ record, refused, otherUses })
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    })()
    return () => { cancelled = true }
  }, [companyId, doc])

  const canConfirm = !!facts && !facts.refused && !busy

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await deleteDocument({ companyId, userId, documentId: doc.id })
      await onDone?.()
      onClose()
    } catch (err) {
      setError(errorText(err, t))
      setBusy(false)
    }
  }

  let body = t('shared:documents.actions.checking')
  if (facts) {
    const name = fileName(doc)
    const record = facts.record ? t(`shared:documents.actions.recordPhrase.${facts.record.type}`, { label: facts.record.label }) : null
    if (facts.otherUses > 0) body = t('shared:documents.actions.deleteShared', { name, record: record ?? '', count: facts.otherUses })
    else if (record) body = t('shared:documents.actions.deleteConfirmText', { name, record })
    else body = t('shared:documents.actions.deleteConfirmTextNoRecord', { name })
  }

  return (
    <Modal title={t('shared:documents.actions.deleteTitle')} onClose={onClose}>
      <p style={{ fontSize: 14, margin: 0, overflowWrap: 'anywhere' }}>{body}</p>
      {facts?.refused && <div style={errorBox}>{t('shared:documents.actions.refuseSoleProof')}</div>}
      {error && <div style={errorBox}>{error}</div>}
      <ModalFooter>
        <button type="button" onClick={onClose} style={btnSecondary}>{t('common:action.cancel')}</button>
        <button type="button" onClick={handleConfirm} disabled={!canConfirm} style={{ padding: '8px 18px', background: 'var(--color-danger, #dc2626)', border: 'none', borderRadius: 'var(--radius-md)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5 }}>
          {busy ? t('shared:documents.actions.deleting') : t('shared:documents.actions.deleteBtn')}
        </button>
      </ModalFooter>
    </Modal>
  )
}
