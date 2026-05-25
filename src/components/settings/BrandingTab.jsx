import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useCompanyBranding } from '../../hooks/useCompanyBranding'
import CompanyLogoUpload from './CompanyLogoUpload'
import styles from './BrandingTab.module.css'

const PLATFORM_PRIMARY = '#f27243'
const PLATFORM_ACCENT = '#f59e0b'
const HEX_RE = /^#[0-9A-Fa-f]{6}$/

export default function BrandingTab() {
  const { company } = useAuth()
  const { updateBranding, loading } = useCompanyBranding()

  const [name, setName] = useState('')
  const [primaryColor, setPrimaryColor] = useState(PLATFORM_PRIMARY)
  const [accentColor, setAccentColor] = useState(PLATFORM_ACCENT)
  const [toast, setToast] = useState('')
  const [saveError, setSaveError] = useState(null)

  // Seed from company on load
  useEffect(() => {
    if (!company) return
    setName(company.name || '')
    setPrimaryColor(company.primary_color || PLATFORM_PRIMARY)
    setAccentColor(company.accent_color || PLATFORM_ACCENT)
  }, [company])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const primaryValid = HEX_RE.test(primaryColor)
  const accentValid = HEX_RE.test(accentColor)
  const nameValid = name.trim().length > 0

  const hasChanges = company && (
    name !== (company.name || '') ||
    primaryColor !== (company.primary_color || PLATFORM_PRIMARY) ||
    accentColor !== (company.accent_color || PLATFORM_ACCENT)
  )

  const canSave = hasChanges && primaryValid && accentValid && nameValid && !loading

  function handleReset() {
    if (!company) return
    setName(company.name || '')
    setPrimaryColor(company.primary_color || PLATFORM_PRIMARY)
    setAccentColor(company.accent_color || PLATFORM_ACCENT)
    setSaveError(null)
  }

  async function handleSave() {
    setSaveError(null)
    try {
      await updateBranding({
        name: name.trim(),
        primary_color: primaryColor === PLATFORM_PRIMARY ? null : primaryColor,
        accent_color: accentColor === PLATFORM_ACCENT ? null : accentColor,
      })
      setToast('Brand saved — looking fetching!')
    } catch (err) {
      setSaveError(err.message)
    }
  }

  if (!company) return null

  return (
    <div className={styles.container}>
      {/* COMPANY IDENTITY */}
      <div className={styles.section}>
        <h3 className={styles.sectionLabel}>Company Identity</h3>
        <div className={styles.identityRow}>
          <CompanyLogoUpload />
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Company Name</span>
            <input
              className={`${styles.input} ${!nameValid ? styles.inputError : ''}`}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* BRAND COLORS */}
      <div className={styles.section}>
        <h3 className={styles.sectionLabel}>Brand Colors</h3>
        <div className={styles.colorRows}>
          <div className={styles.colorRow}>
            <span className={styles.colorLabel}>Primary</span>
            <input
              type="color"
              className={styles.colorPicker}
              value={primaryValid ? primaryColor : PLATFORM_PRIMARY}
              onChange={e => setPrimaryColor(e.target.value)}
            />
            <input
              className={`${styles.hexInput} ${!primaryValid ? styles.inputError : ''}`}
              value={primaryColor}
              onChange={e => setPrimaryColor(e.target.value)}
              maxLength={7}
              placeholder="#f27243"
            />
            <div className={styles.swatch} style={{ background: primaryValid ? primaryColor : 'transparent' }} />
          </div>
          <div className={styles.colorRow}>
            <span className={styles.colorLabel}>Accent</span>
            <input
              type="color"
              className={styles.colorPicker}
              value={accentValid ? accentColor : PLATFORM_ACCENT}
              onChange={e => setAccentColor(e.target.value)}
            />
            <input
              className={`${styles.hexInput} ${!accentValid ? styles.inputError : ''}`}
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              maxLength={7}
              placeholder="#f59e0b"
            />
            <div className={styles.swatch} style={{ background: accentValid ? accentColor : 'transparent' }} />
          </div>
        </div>
      </div>

      {/* LIVE PREVIEW */}
      <div className={styles.section}>
        <h3 className={styles.sectionLabel}>Live Preview</h3>
        <div className={styles.previewTile}>
          <div className={styles.previewCard} style={{ borderTopColor: primaryValid ? primaryColor : PLATFORM_PRIMARY }}>
            <div className={styles.previewCardTitle}>Project Estimate</div>
            <div className={styles.previewCardBody}>Interior repaint — 2,400 SF</div>
          </div>
          <div className={styles.previewTotalRow} style={{ background: primaryValid ? primaryColor : PLATFORM_PRIMARY }}>
            <span>Estimate Total</span>
            <span className={styles.previewAmount}>$1,234.56</span>
          </div>
          <button
            className={styles.previewButton}
            style={{ background: primaryValid ? primaryColor : PLATFORM_PRIMARY }}
            type="button"
          >
            Send Estimate
          </button>
        </div>
      </div>

      {/* ACTIONS */}
      {saveError && <div className={styles.saveError}>{saveError}</div>}
      {toast && <div className={styles.toast}>{toast}</div>}
      <div className={styles.actions}>
        <button className={styles.resetBtn} onClick={handleReset} disabled={!hasChanges}>Reset</button>
        <button className={styles.saveBtn} onClick={handleSave} disabled={!canSave}>
          {loading ? 'Saving…' : 'Save Brand'}
        </button>
      </div>
    </div>
  )
}
