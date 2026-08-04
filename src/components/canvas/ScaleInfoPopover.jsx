import { useTranslation } from 'react-i18next'
import styles from './ScaleInfoPopover.module.css'

export default function ScaleInfoPopover({
  scaleLabel,
  pixelsPerFoot,
  pixelsPerInch,
  pdfPageInfo,
  isCalibrated,
  zonesCount,
  isSuperAdmin,
  onRecalibrate,
  onRescale,
  onClose,
}) {
  const { t } = useTranslation()
  return (
    <div className={styles.panel} onClick={e => e.stopPropagation()}>
      <div className={styles.heading}>{t('blueprint:scaleInfo.heading')}</div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>{t('blueprint:scaleInfo.scale')}</span>
        <span className={styles.rowValue}>{scaleLabel || '—'}</span>
      </div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>{t('blueprint:scaleInfo.status')}</span>
        <span className={isCalibrated ? styles.statusOk : styles.statusWarn}>
          {isCalibrated ? t('blueprint:scaleInfo.calibrated') : t('blueprint:scaleInfo.usingDefault')}
        </span>
      </div>

      {pixelsPerFoot && (
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('blueprint:scaleInfo.resolution')}</span>
          <span className={styles.rowValue}>{pixelsPerFoot.toFixed(1)} px/ft</span>
        </div>
      )}

      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={() => { onRecalibrate?.(); onClose?.() }}
        >
          {t('blueprint:scaleInfo.recalibrate')}
        </button>
        {zonesCount > 0 && onRescale && (
          <button
            className={styles.actionBtnSecondary}
            onClick={() => { onRescale?.(); onClose?.() }}
          >
            {t('blueprint:scaleInfo.rescaleZones', { count: zonesCount })}
          </button>
        )}
      </div>

      {isSuperAdmin && (
        <>
          <div className={styles.divider} />
          <div className={styles.diagHeading}>{t('blueprint:scaleInfo.diagnostics')}</div>
          <div className={styles.diagRow}>
            <span className={styles.diagLabel}>{t('blueprint:scaleInfo.pxPerFt')}</span> {pixelsPerFoot?.toFixed(1) ?? '—'}
          </div>
          <div className={styles.diagRow}>
            <span className={styles.diagLabel}>{t('blueprint:scaleInfo.dpiSource')}</span> {pixelsPerInch !== 96 ? t('blueprint:scaleInfo.pdfMetadata') : t('blueprint:scaleInfo.fallback96')}
          </div>
          <div className={styles.diagRow}>
            <span className={styles.diagLabel}>{t('blueprint:scaleInfo.renderDpi')}</span> {pixelsPerInch?.toFixed(1) ?? '—'}
          </div>
          {pdfPageInfo && (
            <>
              <div className={styles.diagRow}>
                <span className={styles.diagLabel}>{t('blueprint:scaleInfo.pageSize')}</span> {pdfPageInfo.widthInches?.toFixed(1)}" × {pdfPageInfo.heightInches?.toFixed(1)}"
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
