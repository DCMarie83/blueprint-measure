import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Trash2, Upload } from 'lucide-react'
import { usePaymentInstructions, mergeInstructionDefaults } from '../../hooks/usePaymentInstructions'
import { useSignedQrUrls } from '../../hooks/useSignedQrUrls'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { supabase } from '../../lib/supabase'
import PaymentInstructionsBlock from '../invoices/PaymentInstructionsBlock'
import DocumentNumberingCard from './DocumentNumberingCard'
import styles from './PaymentInstructionsTab.module.css'

const METHODS = [
  { key: 'check', labelKey: 'settings:payment.methods.check' },
  { key: 'zelle', labelKey: 'settings:payment.methods.zelle' },
  { key: 'venmo', labelKey: 'settings:payment.methods.venmo' },
  { key: 'cashapp', labelKey: 'settings:payment.methods.cashapp' },
  { key: 'ach', labelKey: 'settings:payment.methods.ach' },
  { key: 'wire', labelKey: 'settings:payment.methods.wire' },
  { key: 'card_external', labelKey: 'settings:payment.methods.cardExternal' },
  { key: 'other', labelKey: 'settings:payment.methods.other' },
]

const HTTPS_RE = /^https:\/\/.+/i
const URL_RE = /^https?:\/\/.+/i
const QR_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const QR_MAX_BYTES = 2 * 1024 * 1024
const QR_BUCKET = 'payment-qr'

// Account numbers mask after entry (last four visible) with a reveal toggle.
function MaskedInput({ value, onChange, error }) {
  const [revealed, setRevealed] = useState(false)
  const [focused, setFocused] = useState(false)
  const show = revealed || focused || !value
  const masked = value ? '•'.repeat(Math.max(0, value.length - 4)) + value.slice(-4) : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        value={show ? (value || '') : masked}
        onChange={e => { if (show) onChange(e.target.value) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
        inputMode="numeric"
      />
      <button
        type="button"
        onClick={() => setRevealed(r => !r)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, display: 'inline-flex' }}
        aria-pressed={revealed}
      >{revealed ? <EyeOff size={14} /> : <Eye size={14} />}</button>
    </div>
  )
}

export default function PaymentInstructionsTab() {
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()
  const { paymentInstructions, loading, savePaymentInstructions } = usePaymentInstructions()
  const [form, setForm] = useState(() => mergeInstructionDefaults(null))
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [errors, setErrors] = useState({})
  const [qrBusy, setQrBusy] = useState(null) // method key while uploading/removing
  const fileRefs = useRef({})
  const qrUrls = useSignedQrUrls(form)

  useEffect(() => {
    if (!loading && paymentInstructions && !seeded) {
      setForm(mergeInstructionDefaults(paymentInstructions))
      setSeeded(true)
    }
  }, [loading, paymentInstructions, seeded])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  if (loading && !seeded) return <div style={{ color: 'var(--color-text-muted)' }}>{t('common:misc.loading')}</div>

  function update(method, field, value) {
    setForm(prev => ({ ...prev, [method]: { ...prev[method], [field]: value } }))
    setErrors(prev => { const n = { ...prev }; delete n[`${method}.${field}`]; return n })
  }

  function toggleMethod(method) {
    setForm(prev => ({ ...prev, [method]: { ...prev[method], enabled: !prev[method].enabled } }))
  }

  async function handleQrUpload(method, file) {
    if (!file || !companyId) return
    if (!QR_TYPES.includes(file.type)) { setErrors(prev => ({ ...prev, [`${method}.qr_path`]: t('settings:payment.qrBadType') })); return }
    if (file.size > QR_MAX_BYTES) { setErrors(prev => ({ ...prev, [`${method}.qr_path`]: t('settings:payment.qrTooLarge') })); return }
    setQrBusy(method)
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${companyId}/${method}.${ext}`
      const oldPath = form[method]?.qr_path
      if (oldPath && oldPath !== path) {
        await supabase.storage.from(QR_BUCKET).remove([oldPath]).catch?.(() => {})
      }
      const { error: upErr } = await supabase.storage.from(QR_BUCKET).upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
      if (upErr) throw upErr
      update(method, 'qr_path', path)
    } catch (err) {
      setErrors(prev => ({ ...prev, [`${method}.qr_path`]: err.message }))
    } finally {
      setQrBusy(null)
    }
  }

  async function handleQrRemove(method) {
    const path = form[method]?.qr_path
    if (!path) return
    setQrBusy(method)
    try {
      await supabase.storage.from(QR_BUCKET).remove([path])
      update(method, 'qr_path', '')
    } catch (err) {
      setErrors(prev => ({ ...prev, [`${method}.qr_path`]: err.message }))
    } finally {
      setQrBusy(null)
    }
  }

  function validate() {
    const e = {}
    const req = (cond, key) => { if (cond) e[key] = t('common:misc.requiredWhenEnabled') }
    for (const m of METHODS) {
      const d = form[m.key]
      if (!d?.enabled) continue
      if (m.key === 'check') req(!d.payable_to?.trim(), 'check.payable_to')
      if (m.key === 'zelle' || m.key === 'venmo' || m.key === 'cashapp') {
        req(!d.handle?.trim(), `${m.key}.handle`)
        if (d.link?.trim() && !URL_RE.test(d.link.trim())) e[`${m.key}.link`] = t('settings:payment.invalidUrl')
      }
      if (m.key === 'ach') req(!d.account_number?.trim() && !d.instructions?.trim(), 'ach.account_number')
      if (m.key === 'wire') req(!d.account_number?.trim() && !d.instructions?.trim(), 'wire.account_number')
      if (m.key === 'card_external') {
        if (!d.url?.trim()) e['card_external.url'] = t('common:misc.requiredWhenEnabled')
        else if (!HTTPS_RE.test(d.url.trim())) e['card_external.url'] = t('settings:payment.httpsOnly')
      }
      if (m.key === 'other') req(!d.instructions?.trim(), 'other.instructions')
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

  function textField(method, field, labelKey, opts = {}) {
    const d = form[method]
    const errKey = `${method}.${field}`
    return (
      <label className={styles.field}><span className={styles.fieldLabel}>{t(labelKey)}</span>
        <input className={`${styles.input} ${errors[errKey] ? styles.inputError : ''}`} value={d[field] || ''} onChange={e => update(method, field, e.target.value)} placeholder={opts.placeholder || ''} />
        {errors[errKey] && <span className={styles.errorText}>{errors[errKey]}</span>}
      </label>
    )
  }

  function qrControls(method) {
    const d = form[method]
    return (
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('settings:payment.qrLabel')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {d.qr_path && qrUrls[method] && (
            <img src={qrUrls[method]} alt="" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--color-border)', background: '#fff' }} />
          )}
          <input
            ref={el => { fileRefs.current[method] = el }}
            type="file"
            accept={QR_TYPES.join(',')}
            style={{ display: 'none' }}
            onChange={e => { handleQrUpload(method, e.target.files?.[0]); e.target.value = '' }}
          />
          <button type="button" onClick={() => fileRefs.current[method]?.click()} disabled={qrBusy === method}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer' }}>
            <Upload size={13} /> {qrBusy === method ? t('settings:payment.qrWorking') : d.qr_path ? t('settings:payment.qrReplace') : t('settings:payment.qrUpload')}
          </button>
          {d.qr_path && (
            <button type="button" onClick={() => handleQrRemove(method)} disabled={qrBusy === method}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer' }}>
              <Trash2 size={13} /> {t('settings:payment.qrRemove')}
            </button>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t('settings:payment.qrHint')}</span>
        {errors[`${method}.qr_path`] && <span className={styles.errorText}>{errors[`${method}.qr_path`]}</span>}
      </div>
    )
  }

  function bankFields(method) {
    const d = form[method]
    return (
      <>
        {textField(method, 'bank_name', 'settings:payment.bankName')}
        {textField(method, 'routing_number', 'settings:payment.routingNumber')}
        <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.accountNumber')}</span>
          <MaskedInput value={d.account_number || ''} onChange={v => update(method, 'account_number', v)} error={errors[`${method}.account_number`]} />
          {errors[`${method}.account_number`] && <span className={styles.errorText}>{errors[`${method}.account_number`]}</span>}
        </label>
        {method === 'ach' ? (
          <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.accountType')}</span>
            <select className={styles.input} value={d.account_type || ''} onChange={e => update(method, 'account_type', e.target.value)}>
              <option value="">{t('settings:payment.accountTypeNone')}</option>
              <option value="checking">{t('settings:payment.accountTypeChecking')}</option>
              <option value="savings">{t('settings:payment.accountTypeSavings')}</option>
            </select>
          </label>
        ) : (
          textField(method, 'swift', 'settings:payment.swift')
        )}
        <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.extraInstructions')}</span>
          <textarea className={styles.textarea} value={d.instructions || ''} onChange={e => update(method, 'instructions', e.target.value)} rows={2} />
        </label>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, margin: '4px 0 0' }}>{t('settings:payment.bankSafetyNote')}</p>
      </>
    )
  }

  function renderFields(method) {
    const d = form[method]
    if (!d?.enabled) return null
    switch (method) {
      case 'check': return (
        <>
          {textField('check', 'payable_to', 'settings:payment.payableTo')}
          <label className={styles.field}><span className={styles.fieldLabel}>{t('settings:payment.mailingAddress')}</span>
            <textarea className={styles.textarea} value={d.mailing_address || ''} onChange={e => update('check', 'mailing_address', e.target.value)} rows={3} />
          </label>
        </>
      )
      case 'zelle':
      case 'venmo':
      case 'cashapp': return (
        <>
          {textField(method, 'handle', method === 'zelle' ? 'settings:payment.zelleHandle' : method === 'venmo' ? 'settings:payment.venmoUsername' : 'settings:payment.cashappCashtag')}
          {textField(method, 'link', 'settings:payment.paymentLink', { placeholder: 'https://...' })}
          {qrControls(method)}
        </>
      )
      case 'ach': return bankFields('ach')
      case 'wire': return bankFields('wire')
      case 'card_external': return (
        <>
          {textField('card_external', 'label', 'settings:payment.buttonLabel', { placeholder: t('settings:payment.payWithCard') })}
          {textField('card_external', 'url', 'settings:payment.checkoutUrl', { placeholder: 'https://...' })}
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
      {/* G80: document numbering lives here — Settings has no Invoices tab,
          and this tab is the invoice-settings home. */}
      <DocumentNumberingCard />
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

      {/* Preview: exactly what the client sees on the portal */}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps, 0.04em)', color: 'var(--color-text-muted)', margin: '0 0 10px' }}>{t('settings:payment.previewTitle')}</h3>
        <PaymentInstructionsBlock paymentInstructions={form} variant="portal" surface="portal" qrUrlFor={(key) => qrUrls[key] || null} />
      </div>
    </div>
  )
}
