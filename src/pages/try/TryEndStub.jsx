import { Link } from 'react-router-dom'
import s from './try.module.css'

export default function TryEndStub() {
  return (
    <div className={s.stub}>
      <h1 className={s.stubTitle}>You're all set</h1>
      <p className={s.stubText}>Offer + email capture coming here.</p>
      <Link to="/try" className={s.backLink}>← Back to demo home</Link>
    </div>
  )
}
