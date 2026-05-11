import { BarChart3 } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import styles from './DashboardPage.module.css'

export default function ReportsPage() {
  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <BarChart3 size={48} style={{ color: 'var(--color-primary)', marginBottom: 16 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Reports</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 15 }}>Job profitability, team performance, and revenue analytics — coming soon.</p>
        </div>
      </main>
    </div>
  )
}
