import { useTranslation } from 'react-i18next'
import styles from './PayTable.module.css'

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export default function PayTable({ rows, className, onDownloadStatement, downloadingId }) {
  const { t } = useTranslation()
  const totalHours = rows.reduce((s, r) => s + r.hours, 0)
  const totalPay = rows.reduce((s, r) => s + r.pay, 0)

  if (rows.length === 0) return null

  const showActions = !!onDownloadStatement
  const anyMissingRate = rows.some(r => r.hasMissingRate)

  return (
    <div className={`${styles.wrap} ${className || ''}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>{t('misc:payTable.worker')}</th>
            <th className={styles.th} style={{ textAlign: 'right' }}>{t('misc:payTable.hours')}</th>
            <th className={styles.th} style={{ textAlign: 'right' }}>{t('misc:payTable.avgRate')}</th>
            <th className={styles.th} style={{ textAlign: 'right' }}>{t('misc:payTable.pay')}</th>
            {showActions && <th className={styles.th} style={{ textAlign: 'right', width: 90 }}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.crewMemberId} className={styles.tr}>
              <td className={styles.td} style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{r.name}</td>
              <td className={styles.td} style={{ textAlign: 'right' }}>{r.hours.toFixed(2)}</td>
              <td className={styles.td} style={{ textAlign: 'right' }}>
                {r.rate > 0 ? fmtUSD.format(r.rate) : (
                  <span className={styles.noRate}>$0.00 <small>{t('misc:payTable.noRateSet')}</small></span>
                )}
              </td>
              <td className={styles.td} style={{ textAlign: 'right', fontWeight: 600 }}>
                {fmtUSD.format(r.pay)}
                {r.hasMissingRate && (
                  <span title={t('misc:payTable.missingRateTooltip')} style={{ marginLeft: 4, color: 'var(--color-warning, #f59e0b)' }}>⚠︎</span>
                )}
              </td>
              {showActions && (
                <td className={styles.td} style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => onDownloadStatement(r.crewMemberId, r.name)}
                    disabled={downloadingId === r.crewMemberId}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '4px 10px',
                      background: 'none', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius)', color: 'var(--color-primary)',
                      cursor: downloadingId === r.crewMemberId ? 'wait' : 'pointer',
                      opacity: downloadingId === r.crewMemberId ? 0.5 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {downloadingId === r.crewMemberId ? t('misc:payTable.generating') : t('misc:payTable.statement')}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.totalsRow}>
            <td className={styles.td} style={{ fontWeight: 700 }}>{t('misc:payTable.total')}</td>
            <td className={styles.td} style={{ textAlign: 'right', fontWeight: 700 }}>{totalHours.toFixed(2)}</td>
            <td className={styles.td}></td>
            <td className={styles.td} style={{ textAlign: 'right', fontWeight: 700 }}>{fmtUSD.format(totalPay)}</td>
            {showActions && <td className={styles.td}></td>}
          </tr>
        </tfoot>
      </table>
      {anyMissingRate && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: '8px 0 0' }}>
          {t('misc:payTable.missingRateNote')}
        </p>
      )}
    </div>
  )
}
