import { Calculator, Layers, PenLine } from 'lucide-react'
import './materialsFlow.css'

const cardBase = {
  display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
  padding: '18px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', textAlign: 'left', width: '100%', cursor: 'pointer',
  color: 'var(--color-text, #1b2426)',
}

function ActionCard({ icon: Icon, title, subtitle, onClick, disabled, hint }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? hint : ''}
      style={{ ...cardBase, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #26464C, #1B2426)', color: '#fff' }}>
        <Icon size={16} />
      </span>
      <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{disabled ? hint : subtitle}</span>
    </button>
  )
}

export default function MaterialsStartScreen({ hasZones, onQuick, onSwipe, onTable }) {
  return (
    <div className="mf-fadein" style={{ maxWidth: 560, margin: '32px auto', textAlign: 'center' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: 'var(--color-text, #1b2426)' }}>Add materials for this job?</h2>
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '0 0 24px' }}>Built from your measurements.</p>
      <div style={{ display: 'grid', gap: 12 }}>
        <ActionCard icon={Calculator} title="Quick total" subtitle="Just the number" onClick={onQuick} disabled={!hasZones} hint="Measure this job first" />
        <ActionCard icon={Layers} title="Review item by item" subtitle="Swipe through the list" onClick={onSwipe} disabled={!hasZones} hint="Measure this job first" />
        <ActionCard icon={PenLine} title="Build it myself" subtitle="Straight to the full editor" onClick={onTable} />
      </div>
    </div>
  )
}
