import { useTranslation } from 'react-i18next'
import { buildPaymentMethods } from '../../lib/paymentMethods'
import BankDetailsReveal from './BankDetailsReveal'
import styles from './PaymentInstructionsBlock.module.css'

// Renders the one shared payment-methods model (src/lib/paymentMethods.js).
// qrUrlFor(methodKey, qrPath) resolves QR images for the surface: signed URLs
// on authenticated pages, the portal-asset edge function on portals; omit it
// to skip images. Bank details appear only when their block is enabled — the
// model already guarantees that.
// surface: 'app' on the contractor's own screens (full bank lines from the
// company row) | 'portal' on client surfaces (bank methods render a
// deliberate reveal via BankDetailsReveal, wired by portalToken).
export default function PaymentInstructionsBlock({ paymentInstructions, variant = 'portal', surface = 'portal', heading, qrUrlFor, portalToken }) {
  const { t } = useTranslation()
  const methods = buildPaymentMethods(paymentInstructions, { surface })
  if (methods.length === 0) return null
  const headingText = heading ?? t('invoices:payment.methodsHeading')

  return (
    <div className={styles.block}>
      <h3 className={styles.heading}>{headingText}</h3>
      <div className={styles.methods}>
        {methods.map(m => {
          if (m.revealable) {
            return (
              <div key={m.key} className={styles.method}>
                <span className={styles.methodLabel}>{t(`invoices:payment.revealRow.${m.key}`)}</span>
                <div className={styles.methodBody}>
                  <BankDetailsReveal methodKey={m.key} portalToken={portalToken} />
                </div>
              </div>
            )
          }
          const qrUrl = m.qr_path && qrUrlFor ? qrUrlFor(m.key, m.qr_path) : null
          return (
            <div key={m.key} className={styles.method}>
              {m.key !== 'other' && !m.pointer && (
                <span className={styles.methodLabel}>{t(`invoices:payment.method.${m.key}`)}</span>
              )}
              <div className={styles.methodBody} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  {m.lines.map((line, i) => (
                    <div key={i} className={line.label ? undefined : styles.pre}>
                      {line.label ? <>{t(`invoices:payment.line.${line.label}`)}: <strong>{line.value}</strong></> : line.value}
                    </div>
                  ))}
                  {m.link && (
                    variant === 'portal' ? (
                      <a href={m.link} target="_blank" rel="noopener noreferrer" className={m.key === 'card_external' ? styles.cardBtn : undefined} style={m.key === 'card_external' ? undefined : { color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }}>
                        {m.key === 'card_external' ? (m.linkLabel || t('invoices:payment.payWithCard')) : m.link}
                      </a>
                    ) : (
                      <div style={{ wordBreak: 'break-all' }}>
                        {m.key === 'card_external' ? `${m.linkLabel || t('invoices:payment.payWithCard')}: ${m.link}` : m.link}
                      </div>
                    )
                  )}
                </div>
                {qrUrl && (
                  <img
                    src={qrUrl}
                    alt={t('invoices:payment.qrAlt', { method: t(`invoices:payment.method.${m.key}`) })}
                    style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--color-border, #e5e5e5)', background: '#fff' }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
