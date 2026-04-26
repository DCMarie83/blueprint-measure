import { useEffect } from 'react'
import styles from './ScaleChangeDialog.module.css'

export default function ScaleChangeDialog({
  open, zoneCount, oldScaleLabel, newScaleLabel,
  onRecalculate, onKeepAsIs, onCancel,
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const s = zoneCount === 1 ? '' : 's'

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>Scale changed</h2>
        <p className={styles.body}>
          This page has {zoneCount} zone{s} drawn at the previous scale ({oldScaleLabel}).
          What would you like to do?
        </p>

        <div className={styles.options}>
          <button className={styles.primaryBtn} onClick={onRecalculate} autoFocus>
            Recalculate zones at new scale
            <span className={styles.subtext}>
              Updates all {zoneCount} zone{s} using {newScaleLabel}
            </span>
          </button>

          <button className={styles.secondaryBtn} onClick={onKeepAsIs}>
            Keep zones as-is
            <span className={styles.subtext}>
              Existing zones stay at their current values. New zones use {newScaleLabel}
            </span>
          </button>

          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
            <span className={styles.subtext}>Keeps {oldScaleLabel}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
