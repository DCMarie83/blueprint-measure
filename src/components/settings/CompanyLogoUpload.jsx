import { useState, useRef, useEffect } from 'react'
import { Upload, Trash2, Loader } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCompanyBranding } from '../../hooks/useCompanyBranding'
import styles from './CompanyLogoUpload.module.css'

export default function CompanyLogoUpload() {
  const { company } = useAuth()
  const { uploadLogo, deleteLogo, uploading } = useCompanyBranding()
  const [error, setError] = useState(null)
  const [imgError, setImgError] = useState(false)
  const [cacheBust, setCacheBust] = useState(Date.now())
  const fileRef = useRef(null)

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(t)
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
    try {
      await uploadLogo(file)
      setCacheBust(Date.now())
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Remove company logo?')) return
    setError(null)
    try {
      await deleteLogo()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.avatar}>
        {showImage ? (
          <img src={`${logoUrl}?v=${cacheBust}`} alt={`${company.name} logo`} className={styles.img} onError={() => setImgError(true)} />
        ) : (
          <span className={styles.initials}>{initials}</span>
        )}

        {uploading && (
          <div className={styles.loadingOverlay}>
            <Loader size={22} className={styles.spinner} />
          </div>
        )}

        <div className={styles.hoverOverlay}>
          <button className={styles.overlayBtn} onClick={() => fileRef.current?.click()} title="Upload logo">
            <Upload size={16} />
          </button>
          {showImage && (
            <button className={styles.overlayBtn} onClick={handleDelete} title="Remove logo">
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
