import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Read-only list of stored documents (private import-documents bucket).
// Paths are stored, never URLs — opening a file mints a fresh signed URL.
export default function DocumentsSection({ documents }) {
  const { t } = useTranslation()
  const [openingId, setOpeningId] = useState(null)

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

  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--color-text-muted)', margin: '0 0 14px' }}>
        {t('shared:documents.title', { count: documents.length })}
      </h3>
      {documents.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{t('shared:documents.empty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {documents.map(doc => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <FileText size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {doc.original_filename || doc.bucket_path.split('/').pop()}
              </span>
              {doc.doc_type && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                  {doc.doc_type.replace('_', ' ')}
                </span>
              )}
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
