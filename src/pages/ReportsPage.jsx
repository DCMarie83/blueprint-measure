import { Link } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import Logo from '../components/brand/Logo'
import UserMenu from '../components/UserMenu'
import styles from './DashboardPage.module.css'

export default function ReportsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}><Logo variant="mark" /></div>
        <UserMenu />
      </header>
      <main className={styles.main}>
        <Link to="/dashboard" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: 24, display: 'block' }}>← Dashboard</Link>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <BarChart3 size={48} style={{ color: 'var(--color-primary)', marginBottom: 16 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Reports</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 15 }}>Job profitability, team performance, and revenue analytics — coming soon.</p>
        </div>
      </main>
    </div>
  )
}
