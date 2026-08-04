import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { useCompanyBranding } from '../../hooks/useCompanyBranding'
import { supabase } from '../../lib/supabase'
import CompanyLogoUpload from './CompanyLogoUpload'
import { US_STATES } from '../../data/usStates'
import styles from './BrandingTab.module.css'

const PLATFORM_PRIMARY = '#f27243'
const PLATFORM_ACCENT = '#f59e0b'
const HEX_RE = /^#[0-9A-Fa-f]{6}$/

export default function BrandingTab() {
  const { t } = useTranslation()
  const { company } = useAuth()
  const { updateBranding, loading } = useCompanyBranding()

  const [name, setName] = useState('')
  const [primaryColor, setPrimaryColor] = useState(PLATFORM_PRIMARY)
  const [accentColor, setAccentColor] = useState(PLATFORM_ACCENT)
  const [portalTheme, setPortalTheme] = useState('light')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [companyCity, setCompanyCity] = useState('')
  const [companyState, setCompanyState] = useState('')
  const [companyZip, setCompanyZip] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [toast, setToast] = useState('')
  const [saveError, setSaveError] = useState(null)
  const [regions, setRegions] = useState([])

  // Benchmark regions (states) for the Market data region picker.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('benchmark_regions')
        .select('code, display_name')
        .eq('region_type', 'state')
        .order('display_name', { ascending: true })
      if (!cancelled) setRegions(data || [])
    })()
    return () => { cancelled = true }
  }, [])

  // Seed from company on load
  useEffect(() => {
    if (!company) return
    setName(company.name || '')
    setPrimaryColor(company.primary_color || PLATFORM_PRIMARY)
    setAccentColor(company.accent_color || PLATFORM_ACCENT)
    setPortalTheme(company.portal_theme || 'light')
    setAddressLine1(company.address_line1 || '')
    setAddressLine2(company.address_line2 || '')
    setCompanyCity(company.city || '')
    setCompanyState(company.state || '')
    setCompanyZip(company.zip || '')
    setBusinessPhone(company.business_phone || '')
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
    accentColor !== (company.accent_color || PLATFORM_ACCENT) ||
    portalTheme !== (company.portal_theme || 'light') ||
    addressLine1 !== (company.address_line1 || '') ||
    addressLine2 !== (company.address_line2 || '') ||
    companyCity !== (company.city || '') ||
    companyState !== (company.state || '') ||
    companyZip !== (company.zip || '') ||
    businessPhone !== (company.business_phone || '')
  )

  const canSave = hasChanges && primaryValid && accentValid && nameValid && !loading

  function handleReset() {
    if (!company) return
    setName(company.name || '')
    setPrimaryColor(company.primary_color || PLATFORM_PRIMARY)
    setAccentColor(company.accent_color || PLATFORM_ACCENT)
    setPortalTheme(company.portal_theme || 'light')
    setAddressLine1(company.address_line1 || '')
    setAddressLine2(company.address_line2 || '')
    setCompanyCity(company.city || '')
    setCompanyState(company.state || '')
    setCompanyZip(company.zip || '')
    setBusinessPhone(company.business_phone || '')
    setSaveError(null)
  }

  async function handleSave() {
    setSaveError(null)
    try {
      await updateBranding({
        name: name.trim(),
        primary_color: primaryColor === PLATFORM_PRIMARY ? null : primaryColor,
        accent_color: accentColor === PLATFORM_ACCENT ? null : accentColor,
        portal_theme: portalTheme,
        address_line1: addressLine1 || null,
        address_line2: addressLine2 || null,
        city: companyCity || null,
        state: companyState || null,
        zip: companyZip || null,
        business_phone: businessPhone || null,
      })
      setToast(t('settings:branding.savedToast'))
    } catch (err) {
      setSaveError(err.message)
    }
  }

  if (!company) return null

  return (
    <div className={styles.container}>
      {/* COMPANY IDENTITY */}
      <div className={styles.section}>
        <h3 className={styles.sectionLabel}>{t('settings:branding.companyIdentity')}</h3>
        <div className={styles.identityRow}>
          <CompanyLogoUpload />
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('settings:branding.companyName')}</span>
            <input
              className={`${styles.input} ${!nameValid ? styles.inputError : ''}`}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>
        </div>
      </div>

      {/* COMPANY LOCATION */}
      <div className={styles.section}>
        <h3 className={styles.sectionLabel}>{t('settings:branding.companyLocation')}</h3>
        <p className={styles.sectionHint}>{t('settings:branding.locationHint')}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <label className={styles.field} style={{ flex: 2, minWidth: 200 }}>
            <span className={styles.fieldLabel}>{t('settings:branding.street')}</span>
            <input className={styles.input} value={addressLine1} onChange={e => setAddressLine1(e.target.value)} placeholder={t('settings:branding.streetPlaceholder')} />
          </label>
          <label className={styles.field} style={{ flex: 1, minWidth: 120 }}>
            <span className={styles.fieldLabel}>{t('settings:branding.suiteUnit')}</span>
            <input className={styles.input} value={addressLine2} onChange={e => setAddressLine2(e.target.value)} placeholder={t('settings:branding.suitePlaceholder')} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <label className={styles.field} style={{ flex: 2, minWidth: 160 }}>
            <span className={styles.fieldLabel}>{t('settings:branding.city')}</span>
            <input className={styles.input} value={companyCity} onChange={e => setCompanyCity(e.target.value)} placeholder={t('settings:branding.cityPlaceholder')} />
          </label>
          <label className={styles.field} style={{ flex: 1, minWidth: 140 }}>
            <span className={styles.fieldLabel}>{t('settings:branding.state')}</span>
            <select className={styles.input} value={companyState} onChange={e => setCompanyState(e.target.value)}>
              <option value="">{t('settings:branding.notSet')}</option>
              {US_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </label>
          <label className={styles.field} style={{ flex: 0, minWidth: 100 }}>
            <span className={styles.fieldLabel}>{t('settings:branding.zip')}</span>
            <input className={styles.input} value={companyZip} onChange={e => setCompanyZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} placeholder="43215" inputMode="numeric" maxLength={5} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <label className={styles.field} style={{ flex: 1, minWidth: 180 }}>
            <span className={styles.fieldLabel}>{t('settings:branding.businessPhone')}</span>
            <input className={styles.input} value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} placeholder="(614) 555-0100" type="tel" />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className={styles.field} style={{ flex: 1, minWidth: 220 }}>
            <span className={styles.fieldLabel}>{t('settings:branding.marketDataRegion')}</span>
            <select className={styles.input} value={companyState} onChange={e => setCompanyState(e.target.value)}>
              <option value="">{t('settings:branding.notSet')}</option>
              <option value="US">{t('settings:branding.nationalUs')}</option>
              {regions.map(r => <option key={r.code} value={r.code}>{r.display_name}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>{t('settings:branding.marketRegionHint')}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>{t('settings:branding.blsExplainer')}</span>
          </label>
        </div>
      </div>

      {/* BRAND COLORS */}
      <div className={styles.section}>
        <h3 className={styles.sectionLabel}>{t('settings:branding.brandColors')}</h3>
        <div className={styles.colorRows}>
          <div className={styles.colorRow}>
            <span className={styles.colorLabel}>{t('settings:branding.primary')}</span>
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
            <span className={styles.colorLabel}>{t('settings:branding.accent')}</span>
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
        <h3 className={styles.sectionLabel}>{t('settings:branding.livePreview')}</h3>
        <div className={styles.previewTile}>
          <div className={styles.previewCard} style={{ borderTopColor: primaryValid ? primaryColor : PLATFORM_PRIMARY }}>
            <div className={styles.previewCardTitle}>{t('settings:branding.previewTitle')}</div>
            <div className={styles.previewCardBody}>{t('settings:branding.previewBody')}</div>
          </div>
          <div className={styles.previewTotalRow} style={{ background: primaryValid ? primaryColor : PLATFORM_PRIMARY }}>
            <span>{t('settings:branding.previewTotal')}</span>
            <span className={styles.previewAmount}>$1,234.56</span>
          </div>
          <button
            className={styles.previewButton}
            style={{ background: primaryValid ? primaryColor : PLATFORM_PRIMARY }}
            type="button"
          >
            {t('settings:branding.sendEstimate')}
          </button>
        </div>
      </div>

      {/* PORTAL THEME */}
      <div className={styles.section}>
        <h3 className={styles.sectionLabel}>{t('settings:branding.portalTheme')}</h3>
        <p className={styles.sectionHint}>{t('settings:branding.portalThemeHint')}</p>
        <div className={styles.themeToggle}>
          <button
            type="button"
            className={`${styles.themeOption} ${portalTheme === 'light' ? styles.themeOptionActive : ''}`}
            onClick={() => setPortalTheme('light')}
          >
            {t('settings:branding.light')}
          </button>
          <button
            type="button"
            className={`${styles.themeOption} ${portalTheme === 'dark' ? styles.themeOptionActive : ''}`}
            onClick={() => setPortalTheme('dark')}
          >
            {t('settings:branding.dark')}
          </button>
        </div>
      </div>

      {/* ACTIONS */}
      {saveError && <div className={styles.saveError}>{saveError}</div>}
      {toast && <div className={styles.toast}>{toast}</div>}
      <div className={styles.actions}>
        <button className={styles.resetBtn} onClick={handleReset} disabled={!hasChanges}>{t('settings:branding.reset')}</button>
        <button className={styles.saveBtn} onClick={handleSave} disabled={!canSave}>
          {loading ? t('settings:branding.saving') : t('settings:branding.saveBrand')}
        </button>
      </div>
    </div>
  )
}
