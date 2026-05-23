import { useAuth } from '../../context/AuthContext'
import styles from './GreetingStrip.module.css'

export default function GreetingStrip({ firstName }) {
  const { userProfile } = useAuth()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const logoUrl = userProfile?.logo_url || null

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className={styles.hero}>
      {logoUrl && (
        <img src={logoUrl} alt="" className={styles.logo} />
      )}
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.greeting}>{greeting}, {firstName}</p>
      <p className={styles.date}>{formattedDate}</p>
    </div>
  )
}
