import AppHeader from '../components/AppHeader'
import styles from './DashboardPage.module.css'

export default function ClientsPage() {
  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Clients</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>Clients list — coming Friday</p>
      </main>
    </div>
  )
}
