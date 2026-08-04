import { useTranslation } from 'react-i18next'
import './smartbid.css'

function fmtMoney(v) {
  return '$' + (Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// A low/typical/high market track with a marker for the current value.
// Money labels render flat. compact shrinks labels for per-line use.
export default function MarketBand({ low, typical, high, value, width = '100%', compact = false }) {
  const { t } = useTranslation()
  const lo = Number(low) || 0
  const ty = Number(typical) || 0
  const hi = Number(high) || 0
  const val = Number(value) || 0
  const span = hi - lo

  let pct
  let outOfRange = false
  if (span <= 0) {
    pct = 50
  } else if (val < lo) {
    pct = 0
    outOfRange = true
  } else if (val > hi) {
    pct = 100
    outOfRange = true
  } else {
    pct = ((val - lo) / span) * 100
  }
  const typPct = span > 0 ? Math.max(0, Math.min(100, ((ty - lo) / span) * 100)) : 50

  const labelSize = compact ? 9 : 11
  const markerBg = outOfRange ? 'transparent' : '#F27243'
  const markerBorder = outOfRange ? '2px solid #F27243' : '2px solid #fff'

  return (
    <div style={{ width, minWidth: compact ? 120 : 160 }}>
      <div style={{ position: 'relative', height: 6, background: 'var(--color-border, #d4d4d4)', borderRadius: 3, margin: '10px 0' }}>
        {/* typical notch */}
        <span style={{ position: 'absolute', left: `${typPct}%`, top: -3, transform: 'translateX(-50%)', width: 2, height: 12, background: 'var(--color-primary, #26464C)', borderRadius: 1 }} />
        {/* marker */}
        <span
          className="sb-marker"
          style={{
            position: 'absolute', left: `${pct}%`, top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 10, height: 10, borderRadius: '50%',
            background: markerBg, border: markerBorder,
            boxShadow: '0 0 0 4px rgba(242, 114, 67, 0.22)',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: labelSize, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>
        <span>{fmtMoney(lo)}</span>
        <span>{t('smartbid:band.typical', { value: fmtMoney(ty) })}</span>
        <span>{fmtMoney(hi)}</span>
      </div>
    </div>
  )
}
