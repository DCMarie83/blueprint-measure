import { Link } from 'react-router-dom'
import { ArrowLeft, Undo2, Redo2, Square, Minus, Hash, Palette, Ruler, RotateCcw, Download, Info, Eye } from 'lucide-react'
import { useTryLang } from './tryLang'
import { tr } from './tryStrings'
import s from './sub.module.css'
import g from './gc.module.css'

// Measured SF rooms drawn on the plan (fill = color @ ~13%, solid outline,
// white-ringed corner dots, dark label pill with the measurement in the zone color).
const SF_ZONES = [
  { name: 'Open Office', color: '#2e8bff', value: '1,240 SF', x: 50, y: 46, w: 144, h: 96, cx: 122, cy: 94 },
  { name: 'Conference', color: '#22c55e', value: '820 SF', x: 206, y: 46, w: 144, h: 90, cx: 278, cy: 91 },
  { name: 'Reception', color: '#f59e0b', value: '540 SF', x: 50, y: 154, w: 144, h: 90, cx: 122, cy: 199 },
  { name: 'Break Room', color: '#ef4444', value: '610 SF', x: 206, y: 148, w: 144, h: 96, cx: 278, cy: 196 },
]
const LF_ZONE = { name: 'Base Trim', color: '#a855f7', value: '96′ 0″', pts: '52,246 348,246', cx: 200, cy: 236 }

// Sidebar zone list (chip color keys off measurement TYPE, mirroring the app:
// SF=blue, LF=green, count=amber — independent of the zone's draw color).
const ZONES_LIST = [
  { name: 'Open Office', color: '#2e8bff', chip: 'SF', chipClass: 'bpChipSf', value: '1,240 SF' },
  { name: 'Conference', color: '#22c55e', chip: 'SF', chipClass: 'bpChipSf', value: '820 SF' },
  { name: 'Reception', color: '#f59e0b', chip: 'SF', chipClass: 'bpChipSf', value: '540 SF' },
  { name: 'Break Room', color: '#ef4444', chip: 'SF', chipClass: 'bpChipSf', value: '610 SF' },
  { name: 'Base Trim', color: '#a855f7', chip: 'LF', chipClass: 'bpChipLf', value: '96′ 0″' },
]

function vertexDots(z) {
  return [[z.x, z.y], [z.x + z.w, z.y], [z.x + z.w, z.y + z.h], [z.x, z.y + z.h]].map(([cx, cy], i) => (
    <circle key={i} cx={cx} cy={cy} r={3.5} fill={z.color} stroke="#fff" strokeWidth={1.2} />
  ))
}

function labelPill(name, value, color, cx, cy, w = 74) {
  return (
    <g>
      <rect x={cx - w / 2} y={cy - 15} width={w} height={30} rx={3} fill="rgba(15,25,35,0.82)" />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={10} fontWeight="700" fill="#e8edf2" fontFamily="Inter, sans-serif">{name}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize={10} fontWeight="700" fill={color} fontFamily="Inter, sans-serif">{value}</text>
    </g>
  )
}

export default function TryBlueprintPeek() {
  const { lang } = useTryLang()
  const p = tr('peeks', lang)
  const c = tr('common', lang)
  return (
    <div className={s.flow}>
      <div className={s.screen}>
        <div className={s.beatHead}>
          <h2 className={s.beatH}>{p.bpH}</h2>
          <p className={s.beatV}>{p.bpV}</p>
        </div>
        {/* ── Toolbar ── */}
        <div className={g.bpToolbar}>
          <div className={g.bpCluster}><span className={g.bpBtn}><ArrowLeft size={16} /></span></div>
          <div className={g.bpCluster}>
            <span className={`${g.bpBtn} ${g.bpBtnDisabled}`}><Undo2 size={16} /></span>
            <span className={`${g.bpBtn} ${g.bpBtnDisabled}`}><Redo2 size={16} /></span>
          </div>
          <div className={g.bpCluster}>
            <span className={`${g.bpBtn} ${g.bpBtnActive}`}><Square size={15} /> SF</span>
            <span className={g.bpBtn}><Minus size={15} /> LF</span>
            <span className={g.bpBtn}><Hash size={15} /> Count</span>
          </div>
          <div className={g.bpCluster}>
            <span className={g.bpBtn}><Palette size={15} /> Color ▾</span>
          </div>
          <div className={g.bpCluster}>
            <span className={g.bpBtn}><Ruler size={15} /> 1/4″ = 1′ ▾</span>
            <span className={`${g.bpBtn} ${g.bpMono}`}>FT</span>
            <span className={g.bpBtn}><Info size={15} /></span>
          </div>
          <div className={g.bpCluster}>
            <span className={g.bpBtn}><RotateCcw size={15} /></span>
            <span className={g.bpBtn}>⊥</span>
          </div>
          <div className={g.bpCluster}>
            <span className={g.bpBtn}><Download size={15} /> Export ▾</span>
          </div>
          <div className={g.bpRight}>
            <span className={g.bpStatusDot} />
            <span className={g.bpSaved}>Saved 3:42 PM</span>
          </div>
        </div>

        {/* ── Work area ── */}
        <div className={g.bpWork}>
          {/* Sidebar */}
          <div className={g.bpSidebar}>
            <div className={g.bpBreadcrumb}>Dashboard / Oakwood Office / Ground Floor</div>
            <div className={g.bpProject}>Oakwood Office Repaint</div>
            <div className={g.bpProjectDesc}>Ground floor — full interior repaint</div>

            <div className={g.bpSection}>
              <div className={g.bpSectionTitle}>Blueprint</div>
              <div className={g.bpFetched}>✓ Blueprint fetched <span className={g.bpReplace}>Replace</span></div>
            </div>

            <div className={g.bpSectionTitle}>Zones ({ZONES_LIST.length})</div>
            {ZONES_LIST.map((z) => (
              <div key={z.name} className={g.bpZoneCard}>
                <Eye size={13} className={g.bpZoneEye} />
                <span className={g.bpZoneDot} style={{ background: z.color }} />
                <span className={g.bpZoneName}>{z.name}</span>
                <span className={`${g.bpChip} ${g[z.chipClass]}`}>{z.chip}</span>
                <span className={g.bpZoneResult}>{z.value}</span>
              </div>
            ))}

            <div className={g.bpPageTotal}>
              <span>Page Total</span>
              <span>3,210 sq ft · 96′ · 0 items</span>
            </div>
          </div>

          {/* Canvas */}
          <div className={g.bpCanvas}>
            <svg className={g.bpSvg} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Measured floor plan">
              {/* sheet */}
              <rect x={24} y={18} width={352} height={264} fill="#f7f5f0" />
              {/* building + interior walls */}
              <rect x={44} y={40} width={312} height={210} fill="#fbfaf7" stroke="#2a2a2a" strokeWidth={3} />
              <line x1={200} y1={40} x2={200} y2={250} stroke="#2a2a2a" strokeWidth={2.5} />
              <line x1={44} y1={148} x2={200} y2={148} stroke="#2a2a2a" strokeWidth={2.5} />
              <line x1={200} y1={142} x2={356} y2={142} stroke="#2a2a2a" strokeWidth={2.5} />
              {/* door swings */}
              <path d="M200,92 L182,92 M182,92 A18,18 0 0 1 200,110" fill="none" stroke="#9a938a" strokeWidth={1} />
              <path d="M118,148 L118,166 M118,166 A18,18 0 0 1 100,148" fill="none" stroke="#9a938a" strokeWidth={1} />
              <path d="M276,142 L276,160 M276,160 A18,18 0 0 0 294,142" fill="none" stroke="#9a938a" strokeWidth={1} />
              {/* dimension strings */}
              <g stroke="#b5afa6" strokeWidth={0.75}>
                <line x1={44} y1={31} x2={356} y2={31} />
                <line x1={44} y1={28} x2={44} y2={34} />
                <line x1={356} y1={28} x2={356} y2={34} />
                <line x1={35} y1={40} x2={35} y2={250} />
                <line x1={32} y1={40} x2={38} y2={40} />
                <line x1={32} y1={250} x2={38} y2={250} />
              </g>
              <text x={200} y={29} textAnchor="middle" fontSize={7} fill="#8a837a" fontFamily="Inter, sans-serif">48′-0″</text>
              <text x={35} y={145} textAnchor="middle" fontSize={7} fill="#8a837a" fontFamily="Inter, sans-serif" transform="rotate(-90 35 145)">32′-0″</text>
              {/* title block */}
              <rect x={286} y={256} width={70} height={20} fill="none" stroke="#b5afa6" strokeWidth={0.75} />
              <line x1={286} y1={266} x2={356} y2={266} stroke="#b5afa6" strokeWidth={0.5} />
              <text x={290} y={263} fontSize={6} fill="#8a837a" fontFamily="Inter, sans-serif">OAKWOOD OFFICE</text>
              <text x={290} y={273} fontSize={7} fontWeight="700" fill="#5a544c" fontFamily="Inter, sans-serif">A-101</text>

              {/* LF trim zone (under labels) */}
              <polyline points={LF_ZONE.pts} fill="none" stroke={LF_ZONE.color} strokeWidth={2} strokeLinejoin="round" />
              <circle cx={52} cy={246} r={3.5} fill={LF_ZONE.color} stroke="#fff" strokeWidth={1.2} />
              <circle cx={348} cy={246} r={3.5} fill={LF_ZONE.color} stroke="#fff" strokeWidth={1.2} />

              {/* SF room zones */}
              {SF_ZONES.map((z) => (
                <g key={z.name}>
                  <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={1} fill={z.color} fillOpacity={0.13} stroke={z.color} strokeWidth={2} strokeLinejoin="round" />
                  {vertexDots(z)}
                </g>
              ))}

              {/* labels on top */}
              {SF_ZONES.map((z) => (
                <g key={`${z.name}-lbl`}>{labelPill(z.name, z.value, z.color, z.cx, z.cy)}</g>
              ))}
              {labelPill(LF_ZONE.name, LF_ZONE.value, LF_ZONE.color, LF_ZONE.cx, LF_ZONE.cy, 66)}
            </svg>

            {/* overlays */}
            <div className={g.bpScaleBanner}><span className={g.bpBannerDot} /> Sniffed out the scale: 1/4″ = 1′</div>
            <div className={g.bpHintPill}>Tap a zone to edit · Double-click to finish</div>
          </div>
        </div>
      </div>

      <div className={g.peekActions}>
        <Link to="/try/gc" className={g.peekLink}>← {c.backMenu}</Link>
        <Link to="/try" className={g.peekLink}>{c.back}</Link>
      </div>
    </div>
  )
}
