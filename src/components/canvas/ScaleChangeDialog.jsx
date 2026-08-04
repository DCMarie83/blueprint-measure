import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './ScaleChangeDialog.module.css'

export default function ScaleChangeDialog({
  open, zoneCount, oldScaleLabel, newScaleLabel,
  onRecalculate, onKeepAsIs, onCancel,
}) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>{t('blueprint:scaleChange.title')}</h2>
        <p className={styles.body}>
          {t('blueprint:scaleChange.body', { count: zoneCount, oldScaleLabel, newScaleLabel })}
        </p>

        <div className={styles.options}>
          <button className={styles.primaryBtn} onClick={onRecalculate} autoFocus>
            {t('blueprint:scaleChange.updateTitle')}
            <span className={styles.subtext}>
              {t('blueprint:scaleChange.updateSub', { count: zoneCount, newScaleLabel })}
            </span>
          </button>

          <button className={styles.secondaryBtn} onClick={onKeepAsIs}>
            {t('blueprint:scaleChange.keepTitle')}
            <span className={styles.subtext}>
              {t('blueprint:scaleChange.keepSub', { count: zoneCount, oldScaleLabel, newScaleLabel })}
            </span>
          </button>

          <button className={styles.cancelBtn} onClick={onCancel}>
            {t('blueprint:scaleChange.cancelTitle')}
            <span className={styles.subtext}>{t('blueprint:scaleChange.cancelSub', { oldScaleLabel })}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
