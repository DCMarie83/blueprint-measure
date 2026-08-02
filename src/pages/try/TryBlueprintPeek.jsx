import { Link } from 'react-router-dom'
import s from './sub.module.css'
import g from './gc.module.css'

// Static stand-in for SessionPage/BlueprintCanvas: toolbar clusters, a two-pane
// work area (zones sidebar + canvas), zone overlays on a grid "plan", a scale
// readout, and a Page Total footer. No working canvas — screenshot-quality only.
const ZONES = [
  { name: 'Open office — walls', value: '1,240 SF', color: 'var(--color-primary)', box: { top: '8%', left: '6%', width: '46%', height: '40%' } },
  { name: 'Conference — walls', value: '820 SF', color: 'var(--color-info)', box: { top: '8%', left: '58%', width: '34%', height: '30%' } },
  { name: 'Corridor — walls', value: '640 SF', color: 'var(--color-success)', box: { top: '56%', left: '6%', width: '70%', height: '22%' } },
  { name: 'Base trim', value: '312 LF', color: 'var(--color-accent)', box: { top: '84%', left: '6%', width: '86%', height: '9%' } },
]

export default function TryBlueprintPeek() {
  return (
    <div className={s.flow}>
      <div className={s.screen}>
        <div className={g.bpToolbar}>
          <span className={g.bpGroup}>◧ Color</span>
          <span className={g.bpGroup}><span className={g.bpScaleReadout}>1/4" = 1'</span> · FT</span>
          <span className={g.bpGroup}>⤢ Reset view</span>
          <span className={g.bpGroup}>⬇ Export</span>
        </div>

        <div className={g.bpWork}>
          <div className={g.bpSidebar}>
            <div className={g.bpZonesTitle}>Zones ({ZONES.length})</div>
            {ZONES.map((z) => (
              <div key={z.name} className={g.bpZoneItem}>
                <span className={g.bpZoneDot} style={{ background: z.color }} />
                <span className={g.bpZoneName}>{z.name}</span>
                <span className={g.bpZoneVal}>{z.value}</span>
              </div>
            ))}
            <div className={g.bpPageTotal}>
              <span>Page total</span>
              <span>2,700 SF · 312 LF</span>
            </div>
          </div>

          <div className={g.bpCanvasWrap}>
            {ZONES.map((z) => (
              <div
                key={z.name}
                className={g.bpZoneOverlay}
                style={{ ...z.box, borderColor: z.color, background: `color-mix(in srgb, ${z.color} 14%, transparent)` }}
              >
                <span className={g.bpOverlayLabel}>{z.value}</span>
              </div>
            ))}
            <span className={g.bpScaleTag}>Scale 1/4" = 1' · calibrated</span>
          </div>
        </div>
      </div>

      <div className={g.peekActions}>
        <Link to="/try/gc" className={g.peekLink}>← Back to menu</Link>
        <Link to="/try" className={g.peekLink}>Back to demo home</Link>
      </div>
    </div>
  )
}
