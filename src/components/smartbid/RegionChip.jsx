import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// "Market data: {region}" chip. Green tint when a real region resolved; neutral
// gray "National baseline" + a Settings link when the US fallback was used.
// Fires onFallbackShown at most once per mount when the fallback chip renders.
export default function RegionChip({ resolvedRegion, usedFallback, onFallbackShown }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const firedRef = useRef(false)

  useEffect(() => {
    if (usedFallback && !firedRef.current) {
      firedRef.current = true
      onFallbackShown?.()
    }
  }, [usedFallback, onFallbackShown])

  if (usedFallback) {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        <span title={t('smartbid:region.tooltip')} style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: 'var(--color-surface-2, #eef0f0)', color: 'var(--color-text-muted, #6b7280)', whiteSpace: 'nowrap' }}>
          {t('smartbid:region.nationalBaseline')}
        </span>
        <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'var(--color-primary, #26464c)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
          {t('smartbid:region.setRegion')}
        </button>
      </span>
    )
  }

  return (
    <span title={t('smartbid:region.tooltip')} style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: 'rgba(38,70,76,0.12)', color: '#26464C', whiteSpace: 'nowrap' }}>
      {t('smartbid:region.marketData', { region: resolvedRegion?.display_name || '—' })}
    </span>
  )
}
