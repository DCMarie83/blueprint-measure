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
  const verb = zoneCount === 1 ? 'stays' : 'stay'

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>Scale changed — what about your existing zones?</h2>
        <p className={styles.body}>
          This page has {zoneCount} zone{s} drawn at {oldScaleLabel}.
          You changed the scale to {newScaleLabel}. What about your existing zone{s}?
        </p>

        <div className={styles.options}>
          <button className={styles.primaryBtn} onClick={onRecalculate} autoFocus>
            Update zones to new scale
            <span className={styles.subtext}>
              Your {zoneCount} zone{s} will be recalculated at {newScaleLabel}
            </span>
          </button>

          <button className={styles.secondaryBtn} onClick={onKeepAsIs}>
            Keep existing zones unchanged
            <span className={styles.subtext}>
              Your {zoneCount} zone{s} {verb} at {oldScaleLabel}. New zones use {newScaleLabel}
            </span>
          </button>

          <button className={styles.cancelBtn} onClick={onCancel}>
            Don't change scale
            <span className={styles.subtext}>Stay at {oldScaleLabel}. No zones change.</span>
          </button>
        </div>
      </div>
    </div>
  )
}
