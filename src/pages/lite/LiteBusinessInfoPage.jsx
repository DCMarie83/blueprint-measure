import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { updateUserPrefs } from '../../lib/userPrefs'
import { isValidTimeZone, COMMON_US_TIMEZONES } from '../../lib/effectiveTime'
import styles from './lite.module.css'

// Lite "Business info" — the sub's letterhead + how they want to be paid. These
// three fields show up on every invoice PDF/email, so the copy stays plain and
// money-serious (no puns). We write existing companies columns only: name,
// business_phone, and the free-text payment note tucked into the structured
// payment_instructions "other" slot so the shared invoice renderer picks it up.
export default function LiteBusinessInfoPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { company, companyId } = useEffectiveCompany()
  const { user, userProfile, refreshCompany, refreshUserProfile } = useAuth()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [payText, setPayText] = useState('')
  const [timezone, setTimezone] = useState('') // '' = Automatic (device time)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedOk, setSavedOk] = useState(false)

  useEffect(() => {
    if (!company) return
    setName(company.name || '')
    setPhone(company.business_phone || '')
    setPayText(company.payment_instructions?.other?.instructions || '')
  }, [company])

  useEffect(() => {
    setTimezone(userProfile?.timezone || '')
  }, [userProfile])

  // Full canonical IANA list, built once. The common US zones are pinned at the
  // top; this list is everything else, so a sub anywhere can still find theirs.
  const allZones = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone') } catch { return [] }
  }, [])

  async function handleSave() {
    if (!companyId) return
    // Empty select = Automatic (device time), stored as null. A chosen value must
    // pass the same canonical check the list is built from before it can save.
    const tzToSave = timezone ? timezone : null
    if (tzToSave && !isValidTimeZone(tzToSave)) {
      setError(t('lite:business.tzInvalid'))
      return
    }
    setSaving(true); setError(null); setSavedOk(false)
    try {
      // Preserve any other structured payment keys; only touch the free-text slot.
      const existing = (company?.payment_instructions && typeof company.payment_instructions === 'object')
        ? { ...company.payment_instructions } : {}
      if (payText.trim()) existing.other = { enabled: true, instructions: payText.trim() }
      else delete existing.other
      const payment_instructions = Object.keys(existing).length ? existing : null

      const { error: updErr } = await supabase
        .from('companies')
        .update({
          name: name.trim() || null,
          business_phone: phone.trim() || null,
          payment_instructions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', companyId)
      if (updErr) throw new Error(updErr.message)

      // Time zone lives on the user profile (the person), not the company.
      if (user?.id) {
        await updateUserPrefs(supabase, user.id, { timezone: tzToSave })
        await refreshUserProfile()
      }

      await refreshCompany()
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      
      <main className={styles.main}>
        <button className={styles.backLink} onClick={() => navigate(-1)}><ChevronLeft size={15} /> {t('common:action.back')}</button>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{t('lite:business.title')}</h1>
            <p className={styles.subtitle}>{t('lite:business.subtitle')}</p>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.field} style={{ marginBottom: 12 }}>
            <span className={styles.fieldLabel}>{t('lite:business.businessName')}</span>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder={t('lite:business.businessNamePh')} />
          </div>

          <div className={styles.field} style={{ marginBottom: 12 }}>
            <span className={styles.fieldLabel}>{t('lite:business.phone')}</span>
            <input className={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" />
          </div>

          <div className={styles.field} style={{ marginBottom: 12 }}>
            <span className={styles.fieldLabel}>{t('lite:business.timezone')}</span>
            <select className={styles.select} value={timezone} onChange={e => setTimezone(e.target.value)}>
              <option value="">{t('lite:business.automatic')}</option>
              <optgroup label={t('lite:business.commonUs')}>
                {COMMON_US_TIMEZONES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              </optgroup>
              <optgroup label={t('lite:business.allTimezones')}>
                {allZones.map(z => <option key={z} value={z}>{z}</option>)}
              </optgroup>
            </select>
            <p className={styles.helper}>{t('lite:business.tzHelper')}</p>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('lite:business.paymentInstructions')}</span>
            <textarea
              className={styles.input}
              style={{ minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
              value={payText}
              onChange={e => setPayText(e.target.value)}
              placeholder={t('lite:business.payPlaceholder')}
            />
            <p className={styles.helper}>{t('lite:business.payHelper')}</p>
          </div>

          {error && <div className={styles.error} style={{ marginTop: 12, marginBottom: 0 }}>{error}</div>}

          <div className={styles.sheetActions} style={{ marginTop: 16 }}>
            {savedOk && <span className={styles.helper} style={{ color: 'var(--color-success)', alignSelf: 'center' }}>{t('lite:business.saved')}</span>}
            <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>{saving ? t('lite:business.saving') : t('common:action.save')}</button>
          </div>
        </div>
      </main>
    </div>
  )
}
