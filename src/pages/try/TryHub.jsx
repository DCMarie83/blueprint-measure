import { Link } from 'react-router-dom'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import s from './try.module.css'

// The fork. Clean conversion surface: whole-trades voice, no dog puns here.
export default function TryHub() {
  const { lang } = useTryLang()
  const h = tr('hub', lang)
  return (
    <div>
      <h1 className={s.hubTitle}>{h.heading}</h1>
      <p className={s.hubSub}>{h.sub}</p>
      <div className={s.cardGrid}>
        <Link to="/try/sub" className={s.card}>
          <span className={s.cardTitle}>{h.subCard}</span>
          <span className={s.cardSub}>{h.subValue}</span>
        </Link>
        <Link to="/try/gc" className={s.card}>
          <span className={s.cardTitle}>{h.gcCard}</span>
          <span className={s.cardSub}>{h.gcValue}</span>
        </Link>
      </div>
    </div>
  )
}
