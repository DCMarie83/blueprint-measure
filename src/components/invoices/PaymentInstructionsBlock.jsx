import { useTranslation } from 'react-i18next'
import styles from './PaymentInstructionsBlock.module.css'

const METHOD_ORDER = ['check', 'zelle', 'venmo', 'cashapp', 'ach', 'card_external', 'other']

function hasAnyEnabled(pi) {
  if (!pi) return false
  return METHOD_ORDER.some(k => pi[k]?.enabled)
}

export default function PaymentInstructionsBlock({ paymentInstructions, variant = 'portal', heading }) {
  const { t } = useTranslation()
  if (!hasAnyEnabled(paymentInstructions)) return null
  const pi = paymentInstructions
  const headingText = heading ?? t('invoices:payment.methodsHeading')

  return (
    <div className={styles.block}>
      <h3 className={styles.heading}>{headingText}</h3>
      <div className={styles.methods}>
        {pi.check?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>{t('invoices:payment.method.check')}</span>
            <div className={styles.methodBody}>
              {t('invoices:payment.check.payableTo')}<strong>{pi.check.payable_to}</strong>
              {pi.check.mailing_address && <div className={styles.pre}>{t('invoices:payment.check.mailTo', { address: pi.check.mailing_address })}</div>}
            </div>
          </div>
        )}
        {pi.zelle?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>{t('invoices:payment.method.zelle')}</span>
            <div className={styles.methodBody}>{pi.zelle.handle}</div>
          </div>
        )}
        {pi.venmo?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>{t('invoices:payment.method.venmo')}</span>
            <div className={styles.methodBody}>@{pi.venmo.handle}</div>
          </div>
        )}
        {pi.cashapp?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>{t('invoices:payment.method.cashapp')}</span>
            <div className={styles.methodBody}>${pi.cashapp.handle}</div>
          </div>
        )}
        {pi.ach?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>{t('invoices:payment.method.ach')}</span>
            <div className={`${styles.methodBody} ${styles.pre}`}>{pi.ach.instructions}</div>
          </div>
        )}
        {pi.card_external?.enabled && (
          <div className={styles.method}>
            {variant === 'portal' ? (
              <a href={pi.card_external.url} target="_blank" rel="noopener noreferrer" className={styles.cardBtn}>
                {pi.card_external.label || t('invoices:payment.payWithCard')}
              </a>
            ) : (
              <div className={styles.methodBody}>{pi.card_external.label || t('invoices:payment.payWithCard')}: {pi.card_external.url}</div>
            )}
          </div>
        )}
        {pi.other?.enabled && (
          <div className={styles.method}>
            <div className={`${styles.methodBody} ${styles.pre}`}>{pi.other.instructions}</div>
          </div>
        )}
      </div>
    </div>
  )
}
