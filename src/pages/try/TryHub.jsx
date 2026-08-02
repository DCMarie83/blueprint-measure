import { Link } from 'react-router-dom'
import s from './try.module.css'

// The fork. Clean conversion surface: whole-trades voice, no dog puns here.
export default function TryHub() {
  return (
    <div>
      <h1 className={s.hubTitle}>Are you a sub, or do you run the jobs?</h1>
      <div className={s.cardGrid}>
        <Link to="/try/sub" className={s.card}>
          <span className={s.cardTitle}>I'm a sub</span>
          <span className={s.cardSub}>Log your work and get paid.</span>
        </Link>
        <Link to="/try/gc" className={s.card}>
          <span className={s.cardTitle}>I run the jobs</span>
          <span className={s.cardSub}>Estimate jobs and track your crew.</span>
        </Link>
      </div>
    </div>
  )
}
