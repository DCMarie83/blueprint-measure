import { Link } from 'react-router-dom'
import s from './sub.module.css'
import g from './gc.module.css'

// Two guided flows ("try it") + three static peeks ("take a look").
const TILES = [
  { title: 'Build an estimate', to: '/try/gc/estimate', kind: 'try' },
  { title: 'Track your crew', to: '/try/gc/crew', kind: 'try' },
  { title: 'Invoicing', to: '/try/gc/invoicing', kind: 'peek' },
  { title: 'Reporting', to: '/try/gc/reporting', kind: 'peek' },
  { title: 'Blueprint measure', to: '/try/gc/blueprint', kind: 'peek' },
]

export default function TryGcMenu() {
  return (
    <div className={s.flow}>
      <h1 className={g.menuTitle}>You run the jobs. Here's what RivetDog does.</h1>

      <div className={g.tileGrid}>
        {TILES.map((t) => (
          <Link key={t.title} to={t.to} className={g.tile}>
            <span className={g.tileTitle}>{t.title}</span>
            <span className={`${g.tag} ${t.kind === 'try' ? g.tagTry : g.tagPeek}`}>
              {t.kind === 'try' ? 'Try it' : 'Take a look'}
            </span>
          </Link>
        ))}
      </div>

      <div className={s.actions}>
        <Link to="/try" className={s.backLink}>← Back to demo home</Link>
      </div>
    </div>
  )
}
