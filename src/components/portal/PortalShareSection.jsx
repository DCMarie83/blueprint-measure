import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { Copy, ExternalLink, Check } from 'lucide-react'
import styles from './PortalShareSection.module.css'

export default function PortalShareSection({ project, onToggle }) {
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  const portalUrl = `${window.location.origin}/portal/${project.portal_token}`

  useEffect(() => {
    if (!project.portal_enabled || !project.portal_token) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(portalUrl, { width: 180, margin: 1, color: { dark: '#1b2426', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch((err) => console.error('QR generation failed', err))
  }, [project.portal_enabled, project.portal_token, portalUrl])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed', err)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>Customer Portal</h3>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={!!project.portal_enabled}
            onChange={() => onToggle(!project.portal_enabled)}
            className={styles.toggleInput}
          />
          <span className={styles.toggleTrack}>
            <span className={styles.toggleThumb} />
          </span>
          <span className={styles.toggleLabel}>
            {project.portal_enabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      {!project.portal_enabled ? (
        <p className={styles.helpText}>
          Toggle on to generate a shareable link your client can view. Share it via text, email, or print the QR code.
        </p>
      ) : (
        <div className={styles.shareGrid}>
          {qrDataUrl && (
            <div className={styles.qrWrap}>
              <img src={qrDataUrl} alt="Portal QR code" className={styles.qr} />
            </div>
          )}
          <div className={styles.urlBlock}>
            <label className={styles.urlLabel}>Shareable link</label>
            <div className={styles.urlBox}>
              <code className={styles.urlText}>{portalUrl}</code>
            </div>
            <div className={styles.actions}>
              <button onClick={handleCopy} className={styles.copyBtn}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.previewBtn}
              >
                <ExternalLink size={14} />
                Open Portal Preview
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
