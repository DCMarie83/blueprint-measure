import styles from './GreetingStrip.module.css'

export default function GreetingStrip({ firstName, todayDate }) {
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  const formatted = new Date(todayDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className={styles.wrap}>
      <div className={styles.greeting}>Good {timeOfDay}, {firstName}</div>
      <div className={styles.pageLabel}>RivetDog Dashboard</div>
      <div className={styles.date}>{formatted}</div>
    </div>
  )
}
