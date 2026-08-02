import { Link } from 'react-router-dom'
import s from './try.module.css'

// The five GC surfaces that will live under /try/gc. "Build an estimate" and
// "Track your crew" navigate to their stubs so the route tree is walkable now;
// the other three are non-functional placeholders until later stages.
const TILES = [
  { title: 'Build an estimate', to: '/try/gc/estimate' },
  { title: 'Track your crew', to: '/try/gc/crew' },
  { title: 'Invoicing', to: null },
  { title: 'Reporting', to: null },
  { title: 'Blueprint', to: null },
]

export default function TryGcStub() {
  return (
    <div className={s.stub}>
      <h1 className={s.stubTitle}>You run the jobs</h1>
      <div className={s.tileList}>
        {TILES.map((tile) =>
          tile.to ? (
            <Link key={tile.title} to={tile.to} className={`${s.tile} ${s.tileActive}`}>
              <span className={s.tileTitle}>{tile.title}</span>
            </Link>
          ) : (
            <div key={tile.title} className={`${s.tile} ${s.tileMuted}`}>
              <span className={s.tileTitle}>{tile.title}</span>
              <span className={s.tileNote}>Coming soon</span>
            </div>
          )
        )}
      </div>
      <Link to="/try" className={s.backLink}>← Back to demo home</Link>
    </div>
  )
}
