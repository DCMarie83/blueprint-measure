import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

// Deliberate reveal of bank transfer details on the portal. Every confirm is
// a fresh get_portal_bank_details call (and a fresh bank_details_viewed
// activity row server-side). The numbers live only in this component's state
// for the duration of the countdown, never in the URL or storage.
const ERROR_CODES = ['bad_method', 'channel_unavailable', 'not_found', 'method_disabled']

export default function BankDetailsReveal({ methodKey, portalToken }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState('idle') // idle | confirming | loading | revealed | error
  const [details, setDetails] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const timerRef = useRef(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function hide() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setDetails(null)
    setSecondsLeft(0)
    setPhase('idle')
  }

  async function handleConfirm() {
    setPhase('loading')
    setErrorMsg('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_portal_bank_details', {
        p_portal_token: portalToken,
        p_method: methodKey,
        p_channel: 'screen',
      })
      if (rpcErr) throw new Error(rpcErr.message)
      const code = data?.ok === false ? (data?.error || 'not_found') : null
      if (code) {
        setErrorMsg(ERROR_CODES.includes(code) ? t(`invoices:payment.reveal.errors.${code}`) : code)
        setPhase('error')
        return
      }
      setDetails(data)
      const total = Number(data?.expires_in_seconds) || 600
      setSecondsLeft(total)
      setPhase('revealed')
      timerRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) { hide(); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      setErrorMsg(err.message)
      setPhase('error')
    }
  }

  const mm = String(Math.floor(secondsLeft / 60))
  const ss = String(secondsLeft % 60).padStart(2, '0')

  if (phase === 'revealed' && details) {
    const rows = [
      ['bank', details.bank_name],
      ['routing', details.routing_number],
      ['account', details.account_number],
      methodKey === 'ach' ? ['accountType', details.account_type] : ['swift', details.swift],
    ].filter(([, v]) => String(v ?? '').trim() !== '')
    return (
      <div style={{ marginTop: 6 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ fontSize: 14 }}>
            {t(`invoices:payment.line.${label}`)}: <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{value}</strong>
          </div>
        ))}
        {details.instructions && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{details.instructions}</div>}
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-muted, #777)' }}>
          {t('invoices:payment.reveal.countdown', { time: `${mm}:${ss}` })}
          <button onClick={hide} style={{ marginLeft: 10, background: 'none', border: 'none', color: 'var(--color-primary, #26464C)', fontWeight: 600, cursor: 'pointer', fontSize: 12, padding: 0 }}>
            {t('invoices:payment.reveal.hideNow')}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'confirming') {
    return (
      <div style={{ marginTop: 6, padding: '10px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 8 }}>
        <p style={{ fontSize: 13, margin: '0 0 10px', lineHeight: 1.5 }}>{t('invoices:payment.reveal.confirmText')}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPhase('idle')} style={{ padding: '6px 14px', fontSize: 13, background: 'none', border: '1px solid var(--color-border, #ddd)', borderRadius: 8, cursor: 'pointer', color: 'inherit' }}>
            {t('common:action.cancel')}
          </button>
          <button onClick={handleConfirm} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, background: 'var(--color-primary, #26464C)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            {t('invoices:payment.reveal.confirmShow')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setPhase('confirming')}
        disabled={phase === 'loading' || !portalToken}
        style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, background: 'none', border: '1px solid var(--color-primary, #26464C)', color: 'var(--color-primary, #26464C)', borderRadius: 8, cursor: portalToken ? 'pointer' : 'not-allowed', opacity: portalToken ? 1 : 0.55 }}
      >
        {phase === 'loading' ? t('invoices:payment.reveal.loading') : t('invoices:payment.reveal.showDetails')}
      </button>
      {phase === 'error' && errorMsg && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--color-danger, #dc2626)', margin: '6px 0 0' }}>{errorMsg}</p>
      )}
    </div>
  )
}
