import PrintedAsChips from '../numbering/PrintedAsChips'
import styles from '../import/ImportWizardModal.module.css'

// Review cards for estimate import rows whose incoming number matches the
// number an existing estimate was PRINTED under before it was renumbered
// ("Printed as {n}" on its notes). The row is held; the operator either skips
// it (the existing estimate is that document) or imports it as its own
// estimate (the number itself is free). Nothing writes from this component.

const ACTIONS = ['skip', 'import']

export default function EstimatePrintedAsReview({ rows, resolutions, setResolution, t }) {
  return (
    <div style={{ margin: '12px 0' }}>
      <p className={styles.info} style={{ fontWeight: 600 }}>
        {t('estimates:import.printedReview.heldTitle', { count: rows.length })}
      </p>
      {rows.map(row => {
        const ex = row._existing
        if (!ex) return null
        const chosen = resolutions[row._index]?.action ?? null
        return (
          <div
            key={row._index}
            style={{ border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius)', padding: 12, margin: '10px 0' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>{row.estimate_number}</strong>
              <span className={styles.warnBadge}>{t('estimates:import.printedReview.badge')}</span>
            </div>
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              {t('estimates:import.printedReview.explain', { current: ex.estimate_number, number: row.estimate_number })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
              <strong>{ex.estimate_number}</strong>
              <PrintedAsChips notes={ex.notes} />
              {ex.title && <span style={{ color: 'var(--color-text-muted)' }}>{ex.title}</span>}
              {ex.status && <span style={{ color: 'var(--color-text-muted)' }}>{t(`estimates:detail.status.${ex.status}`, { defaultValue: ex.status })}</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {ACTIONS.map(action => (
                <button
                  key={action}
                  type="button"
                  className={`${styles.btn} ${chosen === action ? styles.btnPrimary : styles.btnSecondary}`}
                  style={{ padding: '5px 10px', fontSize: 12 }}
                  onClick={() => setResolution(row._index, chosen === action ? null : { action })}
                >
                  {t(`estimates:import.printedReview.action.${action}`, { number: row.estimate_number })}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>
              {chosen
                ? t(`estimates:import.printedReview.hint.${chosen}`, { current: ex.estimate_number, number: row.estimate_number })
                : t('estimates:import.printedReview.chooseHint')}
            </div>
          </div>
        )
      })}
    </div>
  )
}
