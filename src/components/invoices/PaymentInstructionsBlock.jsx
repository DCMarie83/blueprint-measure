import styles from './PaymentInstructionsBlock.module.css'

const METHOD_ORDER = ['check', 'zelle', 'venmo', 'cashapp', 'ach', 'card_external', 'other']

function hasAnyEnabled(pi) {
  if (!pi) return false
  return METHOD_ORDER.some(k => pi[k]?.enabled)
}

export default function PaymentInstructionsBlock({ paymentInstructions, variant = 'portal', heading = 'Payment Methods' }) {
  if (!hasAnyEnabled(paymentInstructions)) return null
  const pi = paymentInstructions

  return (
    <div className={styles.block}>
      <h3 className={styles.heading}>{heading}</h3>
      <div className={styles.methods}>
        {pi.check?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>Check</span>
            <div className={styles.methodBody}>
              Make payable to: <strong>{pi.check.payable_to}</strong>
              {pi.check.mailing_address && <div className={styles.pre}>Mail to: {pi.check.mailing_address}</div>}
            </div>
          </div>
        )}
        {pi.zelle?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>Zelle</span>
            <div className={styles.methodBody}>{pi.zelle.handle}</div>
          </div>
        )}
        {pi.venmo?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>Venmo</span>
            <div className={styles.methodBody}>@{pi.venmo.handle}</div>
          </div>
        )}
        {pi.cashapp?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>Cash App</span>
            <div className={styles.methodBody}>${pi.cashapp.handle}</div>
          </div>
        )}
        {pi.ach?.enabled && (
          <div className={styles.method}>
            <span className={styles.methodLabel}>ACH / Wire</span>
            <div className={`${styles.methodBody} ${styles.pre}`}>{pi.ach.instructions}</div>
          </div>
        )}
        {pi.card_external?.enabled && (
          <div className={styles.method}>
            {variant === 'portal' ? (
              <a href={pi.card_external.url} target="_blank" rel="noopener noreferrer" className={styles.cardBtn}>
                {pi.card_external.label || 'Pay with Card'}
              </a>
            ) : (
              <div className={styles.methodBody}>{pi.card_external.label || 'Pay with Card'}: {pi.card_external.url}</div>
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
