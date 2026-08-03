import lockupDarkUrl from '../../assets/brand/lockup-orange.png'
import lockupLightUrl from '../../assets/brand/lockup-primary.png'
import { tryStrings } from './tryStrings'
import { useTryTheme } from './tryLang'
import s from './try.module.css'

// The arrival. First thing a visitor sees: the logo, the tagline at real size,
// a short subline, the two language buttons, and a compact "See it your way"
// Dark/Light control so they know the demo can switch appearance.
export default function TryLanguageGate({ onPick }) {
  const g = tryStrings.languageGate.en
  const { theme, setTheme } = useTryTheme()
  return (
    <div className={s.arrival}>
      <img src={theme === 'light' ? lockupLightUrl : lockupDarkUrl} alt="RivetDog" className={s.arrivalLogo} />
      <h1 className={s.arrivalTagline}>{g.tagline}</h1>
      <p className={s.arrivalSub}>{g.sub}</p>
      <div className={s.arrivalButtons}>
        <button className={s.langBtn} onClick={() => onPick('en')}>English</button>
        <button className={s.langBtn} onClick={() => onPick('es')}>Español</button>
      </div>
      <div className={s.arrivalThemeRow}>
        <span className={s.arrivalThemeLabel}>See it your way</span>
        <div className={s.langToggle} role="group" aria-label="Theme">
          <button className={`${s.langChip} ${theme === 'dark' ? s.langChipOn : ''}`} onClick={() => setTheme('dark')}>Dark</button>
          <button className={`${s.langChip} ${theme === 'light' ? s.langChipOn : ''}`} onClick={() => setTheme('light')}>Light</button>
        </div>
      </div>
    </div>
  )
}
