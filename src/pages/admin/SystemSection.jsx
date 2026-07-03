import styles from './sections.module.css'

export default function SystemSection() {
  return (
    <div>
      <h1 className={styles.pageTitle}>System</h1>
      <div className={styles.sectionCard}>
        <h2 className={styles.sectionCardTitle}>System Status</h2>
        <p className={styles.empty}>
          Anthropic API credits, deploy info, system status — coming soon.
        </p>
      </div>
    </div>
  )
}
