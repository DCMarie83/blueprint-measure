import { Link } from 'react-router-dom'
import s from './try.module.css'

export default function TrySubStub() {
  return (
    <div className={s.stub}>
      <h1 className={s.stubTitle}>Sub demo</h1>
      <p className={s.stubText}>Guided log-to-invoice flow coming here.</p>
      <Link to="/try" className={s.backLink}>← Back to demo home</Link>
    </div>
  )
}
