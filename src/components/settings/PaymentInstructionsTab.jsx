import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePaymentInstructions } from '../../hooks/usePaymentInstructions'
import styles from './PaymentInstructionsTab.module.css'

const METHODS = [
  { key: 'check', labelKey: 'settings:payment.methods.check' },
  { key: 'zelle', labelKey: 'settings:payment.methods.zelle' },
  { key: 'venmo', labelKey: 'settings:payment.methods.venmo' },
  { key: 'cashapp', labelKey: 'settings:payment.methods.cashapp' },
  { key: 'ach', labelKey: 'settings:payment.methods.ach' },
  { key: 'card_external', labelKey: 'settings:payment.methods.cardExternal' },
  { key: 'other', labelKey: 'settings:payment.methods.other' },
]

const URL_RE = /^https?:\/\/.+/i

const DEFAULT_FORM = {
  check: { enabled: false, payable_to: '', mailing_address: '' },
  zelle: { enabled: false, handle: '' },
  venmo: { enabled: false, handle: '' },
  cashapp: { enabled: false, handle: '' },
  ach: { enabled: false, instructions: '' },
  card_external: { enabled: false, label: 'Pay with Card', url: '' },
  other: { enabled: false, instructions: '' },
}

export default function PaymentInstructionsTab() {
  const { t } = useTranslation()
  const { paymentInstructions, loading, savePaymentInstructions } = usePaymentInstructions()
  const [form, setForm] = useState(DEFAULT_FORM)
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [errors, setErrors] = useState({})

  // Sync DB data → local form once loading completes.
  // seeded flag prevents re-overwriting user edits after initial load.
  useEffect(() => {
    if (!loading && paymentInstructions && !seeded) {
      setForm(structuredClone(paymentInstructions))
      setSeeded(true)
    }
  }, [loading, paymentInstructions, seeded])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  if (loading && !seeded) return <div style={{ color: 'var(--color-text-muted)' }}>{t('common:misc.loading')}</div>

  function update(method, field, value) {
    setForm(prev => ({ ...prev, [method]: { ...prev[method], [field]: value } }))
    setErrors(prev => { const n = { ...prev }; delete n[`${method}.${field}`]; return n })
  }

  function toggleMethod(method) {
    setForm(prev => ({ ...prev, [method]: { ...prev[method], enabled: !prev[method].enabled } }))
  }

  function validate() {
    const e = {}
    for (const m of METHODS) {
      const d = form[m.key]
      if (!d?.enabled) continue
      if (m.key === 'check') {
        if (!d.payable_to?.trim()) e['check.payable_to'] = t('common:misc.requiredWhenEnabled')
      }
      if (m.key === 'zelle' && !d.handle?.trim()) e['zelle.handle'] = t('common:misc.requiredWhenEnabled')
      if (m.key === 'venmo' && !d.handle?.trim()) e['venmo.handle'] = t('common:misc.requiredWhenEnabled')
      if (m.key === 'cashapp' && !d.handle?.trim()) e['cashapp.handle'] = t('common:misc.requiredWhenEnabled')
      if (m.key === 'ach' && !d.instructions?.trim()) e['ach.instructions'] = t('common:misc.requiredWhenEnabled')
      if (m.key === 'card_external') {
        if (!d.url?.trim()) e['card_external.url'] = t('common:misc.requiredWhenEnabled')
        else if (!URL_RE.test(d.url.trim())) e['card_external.url'] = t('settings:payment.invalidUrl')
      }
      if (m.key === 'other' && !d.instructions?.trim()) e['other.instructions'] = t('common:misc.requiredWhenEnabled')
    }
    return e
  }

  async function handleSave() {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    const result = await savePaymentInstructions(form)
    setSaving(false)
    if (result.success) setToast(t('settings:payment.savedToast'))
  }

  function renderFields(method) {
    const d = form[method]
    if (!d?.enabled) return null
    switch (method) {
      case 'check': return (
        <>
          <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.payableTo')}</span>
            <input className={`${styles.input} ${errors['check.payable_to'] ? styles.inputError : ''}`} value={d.payable_to || ''} onChange={e => update('check', 'payable_to', e.target.value)} />
            {errors['check.payable_to'] && <span className={styles.errorText}>{errors['check.payable_to']}</span>}
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.mailingAddress')}</span>
            <textarea className={styles.textarea} value={d.mailing_address || ''} onChange={e => update('check', 'mailing_address', e.target.value)} rows={3} />
          </label>
        </>
      )
      case 'zelle': return (
        <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.zelleHandle')}</span>
          <input className={`${styles.input} ${errors['zelle.handle'] ? styles.inputError : ''}`} value={d.handle || ''} onChange={e => update('zelle', 'handle', e.target.value)} />
          {errors['zelle.handle'] && <span className={styles.errorText}>{errors['zelle.handle']}</span>}
        </label>
      )
      case 'venmo': return (
        <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.venmoUsername')}</span>
          <div className={styles.prefixWrap}>
            <span className={styles.prefix}>@</span>
            <input className={`${styles.prefixInput} ${errors['venmo.handle'] ? styles.inputError : ''}`} value={d.handle || ''} onChange={e => update('venmo', 'handle', e.target.value)} />
          </div>
          {errors['venmo.handle'] && <span className={styles.errorText}>{errors['venmo.handle']}</span>}
        </label>
      )
      case 'cashapp': return (
        <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.cashappCashtag')}</span>
          <div className={styles.prefixWrap}>
            <span className={styles.prefix}>$</span>
            <input className={`${styles.prefixInput} ${errors['cashapp.handle'] ? styles.inputError : ''}`} value={d.handle || ''} onChange={e => update('cashapp', 'handle', e.target.value)} />
          </div>
          {errors['cashapp.handle'] && <span className={styles.errorText}>{errors['cashapp.handle']}</span>}
        </label>
      )
      case 'ach': return (
        <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.achInstructions')}</span>
          <textarea className={`${styles.textarea} ${errors['ach.instructions'] ? styles.inputError : ''}`} value={d.instructions || ''} onChange={e => update('ach', 'instructions', e.target.value)} rows={3} />
          {errors['ach.instructions'] && <span className={styles.errorText}>{errors['ach.instructions']}</span>}
        </label>
      )
      case 'card_external': return (
        <>
          <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.buttonLabel')}</span>
            <input className={styles.input} value={d.label || ''} onChange={e => update('card_external', 'label', e.target.value)} placeholder={t('settings:payment.payWithCard')} />
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.checkoutUrl')}</span>
            <input className={`${styles.input} ${errors['card_external.url'] ? styles.inputError : ''}`} value={d.url || ''} onChange={e => update('card_external', 'url', e.target.value)} placeholder="https://..." />
            {errors['card_external.url'] && <span className={styles.errorText}>{errors['card_external.url']}</span>}
          </label>
        </>
      )
      case 'other': return (
        <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.paymentInstructions')}</span>
          <textarea className={`${styles.textarea} ${errors['other.instructions'] ? styles.inputError : ''}`} value={d.instructions || ''} onChange={e => update('other', 'instructions', e.target.value)} rows={3} />
          {errors['other.instructions'] && <span className={styles.errorText}>{errors['other.instructions']}</span>}
        </label>
      )
      default: return null
    }
  }

  return (
    <div className={styles.container}>
      {METHODS.map(m => (
        <div key={m.key} className={styles.methodSection}>
          <div className={styles.methodHeader}>
            <span className={styles.methodLabel}>{t(m.labelKey)}</span>
            <label className={styles.toggle}>
              <input type="checkbox" checked={!!form[m.key]?.enabled} onChange={() => toggleMethod(m.key)} />
              <span className={styles.toggleTrack}><span className={styles.toggleThumb} /></span>
            </label>
          </div>
          {form[m.key]?.enabled && <div className={styles.methodBody}>{renderFields(m.key)}</div>}
        </div>
      ))}

      {toast && <div className={styles.toast}>{toast}</div>}
      <div className={styles.actions}>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? t('settings:payment.saving') : t('common:action.save')}</button>
      </div>
    </div>
  )
}
