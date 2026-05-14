import styles from './ScaleInfoPopover.module.css'

const ADMIN_EMAIL = 'main@ngautomationhub.com'

export default function ScaleInfoPopover({
  scaleLabel,
  pixelsPerFoot,
  pixelsPerInch,
  pdfPageInfo,
  isCalibrated,
  zonesCount,
  userEmail,
  onRecalibrate,
  onRescale,
  onClose,
}) {
  return (
    <div className={styles.panel} onClick={e => e.stopPropagation()}>
      <div className={styles.heading}>Scale & Calibration</div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>Scale</span>
        <span className={styles.rowValue}>{scaleLabel || '—'}</span>
      </div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>Status</span>
        <span className={isCalibrated ? styles.statusOk : styles.statusWarn}>
          {isCalibrated ? '✓ Calibrated' : '⚠ Using default'}
        </span>
      </div>

      {pixelsPerFoot && (
        <div className={styles.row}>
          <span className={styles.rowLabel}>Resolution</span>
          <span className={styles.rowValue}>{pixelsPerFoot.toFixed(1)} px/ft</span>
        </div>
      )}

      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={() => { onRecalibrate?.(); onClose?.() }}
        >
          Recalibrate
        </button>
        {zonesCount > 0 && onRescale && (
          <button
            className={styles.actionBtnSecondary}
            onClick={() => { onRescale?.(); onClose?.() }}
          >
            Rescale zones ({zonesCount})
          </button>
        )}
      </div>

      {userEmail === ADMIN_EMAIL && (
        <>
          <div className={styles.divider} />
          <div className={styles.diagHeading}>Diagnostics</div>
          <div className={styles.diagRow}>
            <span className={styles.diagLabel}>px/ft:</span> {pixelsPerFoot?.toFixed(1) ?? '—'}
          </div>
          <div className={styles.diagRow}>
            <span className={styles.diagLabel}>DPI source:</span> {pixelsPerInch !== 96 ? 'PDF metadata' : 'Fallback 96'}
          </div>
          <div className={styles.diagRow}>
            <span className={styles.diagLabel}>Render DPI:</span> {pixelsPerInch?.toFixed(1) ?? '—'}
          </div>
          {pdfPageInfo && (
            <>
              <div className={styles.diagRow}>
                <span className={styles.diagLabel}>Page size:</span> {pdfPageInfo.widthInches?.toFixed(1)}" × {pdfPageInfo.heightInches?.toFixed(1)}"
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
