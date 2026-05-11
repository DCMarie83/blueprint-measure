import { Link } from 'react-router-dom'
import Logo from '../components/brand/Logo'
import UserMenu from '../components/UserMenu'
import styles from './DashboardPage.module.css'

export default function ClientsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}><Logo variant="mark" /></div>
        <UserMenu />
      </header>
      <main className={styles.main}>
        <Link to="/dashboard" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: 24, display: 'block' }}>← Dashboard</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Clients</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>Clients list — coming Friday</p>
      </main>
    </div>
  )
}
