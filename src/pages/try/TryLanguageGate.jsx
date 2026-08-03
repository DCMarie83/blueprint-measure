import lockupUrl from '../../assets/brand/lockup-orange.png'
import { tryStrings } from './tryStrings'
import s from './try.module.css'

// The arrival. First thing a visitor sees: the logo, the tagline at real size,
// a short subline, and the two language buttons. Picking one reveals the hub.
export default function TryLanguageGate({ onPick }) {
  const g = tryStrings.languageGate.en
  return (
    <div className={s.arrival}>
      <img src={lockupUrl} alt="RivetDog" className={s.arrivalLogo} />
      <h1 className={s.arrivalTagline}>{g.tagline}</h1>
      <p className={s.arrivalSub}>{g.sub}</p>
      <div className={s.arrivalButtons}>
        <button className={s.langBtn} onClick={() => onPick('en')}>English</button>
        <button className={s.langBtn} onClick={() => onPick('es')}>Español</button>
      </div>
    </div>
  )
}
