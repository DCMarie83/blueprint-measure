import { Link } from 'react-router-dom'
import s from './try.module.css'

export default function TryCrewStub() {
  return (
    <div className={s.stub}>
      <h1 className={s.stubTitle}>Crew time demo</h1>
      <p className={s.stubText}>RivetPay clock-in-to-approval flow coming here.</p>
      <Link to="/try" className={s.backLink}>← Back to demo home</Link>
    </div>
  )
}
