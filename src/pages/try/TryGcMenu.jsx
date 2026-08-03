import { Link } from 'react-router-dom'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import s from './sub.module.css'
import g from './gc.module.css'

export default function TryGcMenu() {
  const { lang } = useTryLang()
  const m = tr('gcMenu', lang)
  const c = tr('common', lang)

  const guided = [
    { title: m.estH, sub: m.estV, to: '/try/gc/estimate' },
    { title: m.crewH, sub: m.crewV, to: '/try/gc/crew' },
    { title: m.jobsH, sub: m.jobsV, to: '/try/gc/jobs' },
  ]
  const peeks = [
    { title: m.invH, sub: m.invV, to: '/try/gc/invoicing' },
    { title: m.repH, sub: m.repV, to: '/try/gc/reporting' },
    { title: m.bpH, sub: m.bpV, to: '/try/gc/blueprint' },
    { title: m.cliH, sub: m.cliV, to: '/try/gc/clients' },
  ]

  return (
    <div className={s.flow}>
      <h1 className={g.menuTitle}>{m.heading}</h1>
      <p className={g.menuSub}>{m.sub}</p>

      <div className={g.guidedGrid}>
        {guided.map((t) => (
          <Link key={t.title} to={t.to} className={g.guidedTile}>
            <div className={g.guidedText}>
              <span className={g.guidedTitle}>{t.title}</span>
              <span className={g.guidedSub}>{t.sub}</span>
            </div>
            <span className={`${g.tag} ${g.tagTry}`}>Try it</span>
          </Link>
        ))}
      </div>

      <div className={g.peekHeading}>{m.peeksHeading}</div>
      <div className={g.peekGrid}>
        {peeks.map((t) => (
          <Link key={t.title} to={t.to} className={g.peekTile}>
            <span className={g.peekTileTitle}>{t.title}</span>
            <span className={g.peekTileSub}>{t.sub}</span>
          </Link>
        ))}
      </div>

      <div className={s.actions}>
        <Link to="/try" className={s.backLink}>← {c.back}</Link>
      </div>
    </div>
  )
}
