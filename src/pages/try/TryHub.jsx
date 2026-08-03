import { Link } from 'react-router-dom'
import { HardHat, ClipboardList, ArrowRight } from 'lucide-react'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import s from './try.module.css'

// The fork — two matched doors in one design language, distinguished by icon:
// a paint roller (hands-on / sub) vs a job board (running the jobs). Both equal
// weight. Whole-trades voice, no dog puns here.
export default function TryHub() {
  const { lang } = useTryLang()
  const h = tr('hub', lang)
  const cards = [
    { to: '/try/sub', Icon: HardHat, title: h.subCard, sub: h.subValue },
    { to: '/try/gc', Icon: ClipboardList, title: h.gcCard, sub: h.gcValue },
  ]
  return (
    <div>
      <h1 className={s.hubTitle}>{h.heading}</h1>
      <p className={s.hubSub}>{h.sub}</p>
      <div className={s.cardGrid}>
        {cards.map(({ to, Icon, title, sub }) => (
          <Link key={to} to={to} className={s.card}>
            <div className={s.cardTop}>
              <span className={s.cardIcon}><Icon size={26} strokeWidth={2.25} /></span>
              <ArrowRight className={s.cardArrow} size={20} strokeWidth={2.25} />
            </div>
            <span className={s.cardTitle}>{title}</span>
            <span className={s.cardSub}>{sub}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
