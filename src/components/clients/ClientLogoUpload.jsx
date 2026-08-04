import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Trash2, Loader } from 'lucide-react'
import { useClientLogo } from '../../hooks/useClientLogo'
import styles from './ClientLogoUpload.module.css'

export default function ClientLogoUpload({ clientId, currentLogoUrl, clientName, onLogoChange }) {
  const { t } = useTranslation()
  const { uploadLogo, deleteLogo, uploading } = useClientLogo()
  const [error, setError] = useState(null)
  const [imgError, setImgError] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(t)
  }, [error])

  // Reset img error when URL changes
  useEffect(() => { setImgError(false) }, [currentLogoUrl])

  const initials = (clientName || '??')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  const showImage = currentLogoUrl && !imgError

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setError(null)
    try {
      const { url } = await uploadLogo(clientId, file)
      onLogoChange?.(url)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('clients:logo.confirmRemove'))) return
    setError(null)
    try {
      await deleteLogo(clientId)
      onLogoChange?.(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.avatar}>
        {showImage ? (
          <img src={currentLogoUrl} alt={t('clients:logo.alt', { name: clientName })} className={styles.img} onError={() => setImgError(true)} />
        ) : (
          <span className={styles.initials}>{initials}</span>
        )}

        {uploading && (
          <div className={styles.loadingOverlay}>
            <Loader size={20} className={styles.spinner} />
          </div>
        )}

        <div className={styles.hoverOverlay}>
          <button className={styles.overlayBtn} onClick={() => fileRef.current?.click()} title={t('clients:logo.upload')}>
            <Upload size={16} />
          </button>
          {showImage && (
            <button className={styles.overlayBtn} onClick={handleDelete} title={t('clients:logo.remove')}>
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className={styles.hiddenInput} />
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
