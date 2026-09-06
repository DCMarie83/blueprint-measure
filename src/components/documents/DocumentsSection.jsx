import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, ChevronDown, ChevronRight, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useSessionCollapse } from '../../hooks/useSessionCollapse'
import { DOC_TYPES, ATTACH_ACCEPT, guessDocType, validateAttachFile, uploadDocument } from '../../utils/documents'

// Read-only list of stored documents (private import-documents bucket).
// Paths are stored, never URLs — opening a file mints a fresh signed URL.
// `collapsible` (with a `collapseKey`) makes the header a toggle, collapsed
// by default past 8 rows, remembered for the session.
// `uploadTarget` ({ type, id }) adds a direct Upload control (G54): files
// attach straight onto that record with a doc_type picker and the G52
// filename+size dedupe. Attach-only — record fields are never touched.
export default function DocumentsSection({ documents, collapsible = false, collapseKey = 'documents', uploadTarget = null, onUploaded = null }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { companyId } = useEffectiveCompany()
  const [openingId, setOpeningId] = useState(null)
  const [collapsed, setCollapsed] = useSessionCollapse(collapseKey, documents.length > 8)
  const [docType, setDocType] = useState('other')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileRef = useRef(null)

  async function handleOpen(doc) {
    setOpeningId(doc.id)
    try {
      const { data, error } = await supabase.storage.from('import-documents').createSignedUrl(doc.bucket_path, 3600)
      if (error || !data?.signedUrl) throw error ?? new Error('No URL')
      window.open(data.signedUrl, '_blank', 'noopener')
    } catch {
      alert(t('shared:documents.openFailed'))
    } finally {
      setOpeningId(null)
    }
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0 || !uploadTarget || !companyId) return
    setUploading(true)
    setUploadError(null)
    const errors = []
    for (const file of files) {
      const invalid = validateAttachFile(file)
      if (invalid) {
        errors.push(invalid === 'type' ? t('shared:documents.badType', { name: file.name }) : t('shared:documents.tooLarge', { name: file.name }))
        continue
      }
      try {
        await uploadDocument({
          companyId,
          userId: user?.id,
          file,
          docType: docType === 'other' ? guessDocType(file.name) : docType,
          linkedType: uploadTarget.type,
          linkedId: uploadTarget.id,
        })
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`)
      }
    }
    setUploading(false)
    setUploadError(errors.length > 0 ? errors.join(' · ') : null)
    if (fileRef.current) fileRef.current.value = ''
    onUploaded?.()
  }

  function typeChip(doc) {
    if (!doc.doc_type) return null
    const isPaymentProof = doc.doc_type === 'payment_proof'
    return (
      <span style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 9999, whiteSpace: 'nowrap', fontWeight: isPaymentProof ? 700 : 400,
        background: isPaymentProof ? 'rgba(242,114,67,0.14)' : 'var(--color-surface-2)',
        color: isPaymentProof ? '#F27243' : 'var(--color-text-muted)',
      }}>
        {t(`shared:documents.type.${doc.doc_type}`, { defaultValue: doc.doc_type.replace(/_/g, ' ') })}
      </span>
    )
  }

  const headerStyle = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--color-text-muted)', margin: 0 }

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {collapsible ? (
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            style={{ ...headerStyle, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            {t('shared:documents.title', { count: documents.length })}
          </button>
        ) : (
          <h3 style={headerStyle}>
            {t('shared:documents.title', { count: documents.length })}
          </h3>
        )}

        {uploadTarget && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              {DOC_TYPES.map(dt => <option key={dt} value={dt}>{t(`shared:documents.type.${dt}`)}</option>)}
            </select>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              <Upload size={13} /> {uploading ? t('shared:documents.uploading') : t('shared:documents.upload')}
            </button>
            <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} multiple style={{ display: 'none' }} onChange={handleFiles} />
          </span>
        )}
      </div>

      {uploadError && (
        <div style={{ fontSize: 13, color: 'var(--color-danger, #dc2626)', marginBottom: 10 }}>{uploadError}</div>
      )}

      {collapsible && collapsed ? null : documents.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('shared:documents.empty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {documents.map(doc => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <FileText size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {doc.original_filename || doc.bucket_path.split('/').pop()}
              </span>
              {typeChip(doc)}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''}
              </span>
              <button
                onClick={() => handleOpen(doc)}
                disabled={openingId === doc.id}
                style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-primary)', cursor: 'pointer' }}
              >
                {openingId === doc.id ? '…' : t('shared:documents.open')}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
