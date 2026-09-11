import { useState, useRef, useEffect } from 'react'
import { Upload, Trash2, Loader } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useCompanyBranding } from '../../hooks/useCompanyBranding'
import styles from './CompanyLogoUpload.module.css'

export default function CompanyLogoUpload() {
  const { t } = useTranslation()
  const { company } = useAuth()
  const { uploadLogo, deleteLogo, uploading } = useCompanyBranding()
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const [dims, setDims] = useState(null)
  const [imgError, setImgError] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(timer)
  }, [error])

  useEffect(() => { setImgError(false) }, [company?.logo_url])

  const initials = (company?.name || '??')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')

  const logoUrl = company?.logo_url
  const showImage = logoUrl && !imgError

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setError(null)
    setWarning(null)
    try {
      const result = await uploadLogo(file)
      setDims({ width: result.width, height: result.height })
      setWarning(result.warning || null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('settings:logo.removeConfirm'))) return
    setError(null)
    setWarning(null)
    setDims(null)
    try {
      await deleteLogo()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.guidance}>{t('settings:logo.guidance')}</p>

      <div className={styles.previewRow}>
        <div className={styles.avatar}>
          {showImage ? (
            <img src={logoUrl} alt={t('settings:logo.alt', { name: company.name })} className={styles.img} onError={() => setImgError(true)} />
          ) : (
            <span className={styles.initials}>{initials}</span>
          )}

          {uploading && (
            <div className={styles.loadingOverlay}>
              <Loader size={22} className={styles.spinner} />
            </div>
          )}

          <div className={styles.hoverOverlay}>
            <button type="button" className={styles.overlayBtn} onClick={() => fileRef.current?.click()} title={t('settings:logo.upload')}>
              <Upload size={16} />
            </button>
            {showImage && (
              <button type="button" className={styles.overlayBtn} onClick={handleDelete} title={t('settings:logo.remove')}>
                <Trash2 size={16} />
              </button>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleFile} className={styles.hiddenInput} />
        </div>

        {/* Same 42:14 mm box the estimate/invoice PDF header uses, contain-fit:
            distortion or pixelation is visible here before anything ships. */}
        <div className={styles.pdfPreviewCol}>
          <div className={styles.pdfPreviewBox}>
            {showImage ? (
              <img src={logoUrl} alt="" className={styles.pdfPreviewImg} onError={() => setImgError(true)} />
            ) : (
              <span className={styles.pdfPreviewEmpty}>{company?.name || ''}</span>
            )}
          </div>
          <span className={styles.pdfPreviewLabel}>{t('settings:logo.pdfPreviewLabel')}</span>
        </div>
      </div>

      {dims && <div className={styles.dims}>{t('settings:logo.measuredDims', { width: dims.width, height: dims.height })}</div>}
      {warning && <div className={styles.warning}>{warning}</div>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  )
}
