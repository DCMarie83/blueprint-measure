import { useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import styles from './DashboardPage.module.css'

export default function ClientDetailPage() {
  const { id } = useParams()
  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Client Details</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>Client {id} — full details coming Friday</p>
      </main>
    </div>
  )
}
