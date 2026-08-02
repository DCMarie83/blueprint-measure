import { Link } from 'react-router-dom'
import s from './sub.module.css'
import g from './gc.module.css'

// Three guided flows dominate; four peeks are grouped and de-emphasized below.
const GUIDED = [
  { title: 'Build an estimate', sub: 'Watch a bid build itself, line by line.', to: '/try/gc/estimate' },
  { title: 'Track your crew', sub: 'From phone clock-in to one-tap approval.', to: '/try/gc/crew' },
  { title: 'Run your job board', sub: 'Move a job from Review to Sent.', to: '/try/gc/jobs' },
]

const PEEKS = [
  { title: 'Invoicing', to: '/try/gc/invoicing' },
  { title: 'Reporting', to: '/try/gc/reporting' },
  { title: 'Blueprint measure', to: '/try/gc/blueprint' },
  { title: 'Clients', to: '/try/gc/clients' },
]

export default function TryGcMenu() {
  return (
    <div className={s.flow}>
      <h1 className={g.menuTitle}>You run the jobs. Here's what RivetDog does.</h1>

      <div className={g.guidedGrid}>
        {GUIDED.map((t) => (
          <Link key={t.title} to={t.to} className={g.guidedTile}>
            <div className={g.guidedText}>
              <span className={g.guidedTitle}>{t.title}</span>
              <span className={g.guidedSub}>{t.sub}</span>
            </div>
            <span className={`${g.tag} ${g.tagTry}`}>Try it</span>
          </Link>
        ))}
      </div>

      <div className={g.peekHeading}>Take a look around</div>
      <div className={g.peekGrid}>
        {PEEKS.map((t) => (
          <Link key={t.title} to={t.to} className={g.peekTile}>
            <span className={g.peekTileTitle}>{t.title}</span>
            <span className={`${g.tag} ${g.tagPeek}`}>Take a look</span>
          </Link>
        ))}
      </div>

      <div className={s.actions}>
        <Link to="/try" className={s.backLink}>← Back to demo home</Link>
      </div>
    </div>
  )
}
