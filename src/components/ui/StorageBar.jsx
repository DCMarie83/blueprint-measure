import styles from './StorageBar.module.css'

export default function StorageBar({ usedBytes, limitBytes }) {
  const usedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(1)

  // Pilot / unlimited — no bar, just text
  if (limitBytes == null) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.label}>{usedGb} GB used — Unlimited</div>
      </div>
    )
  }

  const limitGb = Math.round(limitBytes / (1024 * 1024 * 1024))
  const percent = Math.min((usedBytes / limitBytes) * 100, 100)

  let colorClass = styles.fillGreen
  if (percent >= 90) colorClass = styles.fillRed
  else if (percent >= 70) colorClass = styles.fillAmber

  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
        <div className={`${styles.fill} ${colorClass}`} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.label}>{usedGb} GB of {limitGb} GB</div>
    </div>
  )
}
