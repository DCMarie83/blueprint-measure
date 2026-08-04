import { PawPrint } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import './smartbid.css'

// The RivetDog Smart Bid identity pill. size 'sm' renders a compact "Smart"
// variant for dense rows (list tags); default renders full "SMART BID".
export default function SmartBadge({ size }) {
  const { t } = useTranslation()
  const compact = size === 'sm'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: compact ? '1px 8px' : '3px 10px',
        borderRadius: 9999,
        background: 'linear-gradient(135deg, var(--color-primary, #26464C), #1B2426)',
        border: '1px solid rgba(242, 114, 67, 0.5)',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F27243', display: 'inline-block' }} />
      <PawPrint size={12} />
      {compact ? t('smartbid:badge.smartCompact') : t('smartbid:badge.smart')}
    </span>
  )
}
