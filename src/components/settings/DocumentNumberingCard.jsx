import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEffectiveCompany } from '../../hooks/useEffectiveCompany'
import { getNumberingInfo, maxUsedDocNumber, saveNumberingSettings } from '../../data/numbering'
import styles from './PaymentInstructionsTab.module.css'

// G80: document numbering settings. Two modes, one line each. In shared mode
// the next-number field is editable but refuses any value at or below the
// highest number already on the books (quotes AND invoices). Changing mode is
// allowed any time; existing numbers never change.
export default function DocumentNumberingCard() {
  const { t } = useTranslation()
  const { companyId } = useEffectiveCompany()
  const [mode, setMode] = useState(null)
  const [nextNumber, setNextNumber] = useState('')
  const [maxUsed, setMaxUsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // { type: 'ok' | 'error', text }

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      try {
        const [info, max] = await Promise.all([getNumberingInfo(companyId), maxUsedDocNumber(companyId)])
        if (cancelled) return
        setMode(info.mode)
        setNextNumber(String(info.nextShared))
        setMaxUsed(max)
      } catch { /* leave card empty on load failure */ }
    })()
    return () => { cancelled = true }
  }, [companyId])

  async function handleSave() {
    setMsg(null)
    let next = null
    if (mode === 'shared') {
      next = Number(String(nextNumber).trim())
      if (!Number.isInteger(next) || next <= 0) {
        setMsg({ type: 'error', text: t('settings:numbering.invalidNumber') })
        return
      }
      // Refuse a value at or below the highest number already on the books.
      const max = await maxUsedDocNumber(companyId)
      setMaxUsed(max)
      if (next <= max) {
        setMsg({ type: 'error', text: t('settings:numbering.refusedBelowMax', { max }) })
        return
      }
    }
    setSaving(true)
    try {
      await saveNumberingSettings(companyId, { mode, nextNumber: next })
      setMsg({ type: 'ok', text: t('settings:numbering.saved') })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  if (mode === null) return null

  const radioRow = (value, label, hint) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '8px 0' }}>
      <input
        type="radio"
        name="numbering_mode"
        checked={mode === value}
        onChange={() => { setMode(value); setMsg(null) }}
        style={{ marginTop: 3 }}
      />
      <span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)' }}>{hint}</span>
      </span>
    </label>
  )

  return (
    <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--color-border)' }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps, 0.04em)', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
        {t('settings:numbering.title')}
      </h3>
      {radioRow('shared', t('settings:numbering.shared'), t('settings:numbering.sharedHint', { number: nextNumber }))}
      {radioRow('prefixed', t('settings:numbering.prefixed'), t('settings:numbering.prefixedHint'))}

      {mode === 'shared' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 0 26px' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t('settings:numbering.nextNumberLabel')}</span>
          <input
            className={styles.input}
            style={{ maxWidth: 120, fontFamily: 'var(--font-mono)' }}
            inputMode="numeric"
            value={nextNumber}
            onChange={e => { setNextNumber(e.target.value); setMsg(null) }}
          />
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '10px 0 0' }}>{t('settings:numbering.modeNote')}</p>

      {msg && (
        <p style={{ fontSize: 13, fontWeight: 600, margin: '8px 0 0', color: msg.type === 'ok' ? 'var(--color-success, #22c55e)' : 'var(--color-danger, #dc2626)' }}>
          {msg.text}
        </p>
      )}
      <div style={{ marginTop: 10 }}>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? t('settings:payment.saving') : t('common:action.save')}
        </button>
      </div>
    </div>
  )
}
