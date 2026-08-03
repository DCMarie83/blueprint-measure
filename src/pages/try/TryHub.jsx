import { Link } from 'react-router-dom'
import { HardHat, ClipboardList } from 'lucide-react'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import s from './try.module.css'

// The fork. Two equally-strong, orange-forward doors — distinguished by icon:
// a hard hat (field/sub) vs a clipboard (running the jobs). Clean conversion
// surface: whole-trades voice, no dog puns here.
export default function TryHub() {
  const { lang } = useTryLang()
  const h = tr('hub', lang)
  return (
    <div>
      <h1 className={s.hubTitle}>{h.heading}</h1>
      <p className={s.hubSub}>{h.sub}</p>
      <div className={s.cardGrid}>
        <Link to="/try/sub" className={s.card}>
          <span className={s.cardIcon}><HardHat size={28} strokeWidth={2.25} /></span>
          <span className={s.cardTitle}>{h.subCard}</span>
          <span className={s.cardSub}>{h.subValue}</span>
        </Link>
        <Link to="/try/gc" className={s.card}>
          <span className={s.cardIcon}><ClipboardList size={28} strokeWidth={2.25} /></span>
          <span className={s.cardTitle}>{h.gcCard}</span>
          <span className={s.cardSub}>{h.gcValue}</span>
        </Link>
      </div>
    </div>
  )
}
