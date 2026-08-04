import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isCoverageLine, materialBuyQuantity } from '../../utils/measurements'
import { GRADES, money, gradeTotal, lineCostAtGrade, itemVisualProps } from '../../lib/materialsView'
import ItemVisual, { CATEGORY_ORDER, categoryForSlug } from './ItemVisual'
import './materialsFlow.css'

const cellInput = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-bg, #fff)', color: 'var(--color-text, #1b2426)', fontSize: 13,
}
const myPriceTag = { fontSize: 10, fontWeight: 600, color: 'var(--color-primary, #26464c)', whiteSpace: 'nowrap' }
const capsLabel = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', color: 'var(--color-text-muted)' }
const gradePill = (active) => ({
  padding: '5px 12px', borderRadius: 9999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
  color: active ? 'var(--color-on-primary, #fff)' : 'var(--color-text, #1b2426)',
})
const stepBtn = { width: 24, height: 28, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text, #1b2426)', borderRadius: 'var(--radius-sm)', fontSize: 15, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }

// Category display keys for the fixed CATEGORY_ORDER identifiers.
const CATEGORY_KEY = {
  'Paint & Primer': 'paintPrimer',
  'Prep & Patch': 'prepPatch',
  'Masking & Protection': 'maskingProtection',
  'Application Tools': 'applicationTools',
  'Other Items': 'otherItems',
}

// A grade cost is a "My price" when it was resolved from this company's override
// for the catalog row behind that grade (id present + override equals the cost).
function isMyPrice(item, gradeKey, overrideMap) {
  const id = item[`catalog_item_${gradeKey}_id`]
  if (!id || !overrideMap || !overrideMap.has(id)) return false
  const cost = item[`cost_${gradeKey}`]
  if (cost === '' || cost == null) return false
  return Number(overrideMap.get(id)) === Number(cost)
}

// Compact numeric stepper: −/+ around a small number input. Label is an 11px
// uppercase tracked muted caption above the control.
function Stepper({ label, value, onChange, min = 0, max, step = 1, disabled, title }) {
  const num = Number(value) || 0
  const set = (v) => {
    let n = Math.round(v * 100) / 100
    if (min != null && n < min) n = min
    if (max != null && n > max) n = max
    onChange(String(n))
  }
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }} title={title}>
      <span style={capsLabel}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: disabled ? 0.5 : 1 }}>
        <button type="button" style={stepBtn} disabled={disabled} onClick={() => set(num - step)} tabIndex={-1}>−</button>
        <input
          style={{ ...cellInput, width: 56, textAlign: 'center', padding: '6px 4px', fontVariantNumeric: 'tabular-nums' }}
          type="number" step={step} min={min} max={max} value={value}
          disabled={disabled} onChange={e => onChange(e.target.value)}
        />
        <button type="button" style={stepBtn} disabled={disabled} onClick={() => set(num + step)} tabIndex={-1}>+</button>
      </span>
    </label>
  )
}

// Per-grade product + cost detail (used by the All-grades expander).
function GradeDetail({ it, gradeKey, label, readOnly, overrides, onUpdate }) {
  const { t } = useTranslation()
  const myPrice = isMyPrice(it, gradeKey, overrides)
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>{label}</span>
        {myPrice && <span style={myPriceTag}>{t('materials:lineItems.myPrice')}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <input style={cellInput} placeholder={t('materials:lineItems.productPlaceholder')} value={it[`product_${gradeKey}`] ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { [`product_${gradeKey}`]: e.target.value })} />
        <input style={cellInput} type="number" step="0.01" placeholder={t('materials:lineItems.costPlaceholder')} value={it[`cost_${gradeKey}`] ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { [`cost_${gradeKey}`]: e.target.value })} />
      </div>
    </div>
  )
}

function LineRow({ it, selectedGrade, readOnly, overrides, lookups, onUpdate, onRemove }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)          // All-grades detail
  const [adjustOpen, setAdjustOpen] = useState(false)  // Coats / Overage
  const coverage = isCoverageLine(it)
  const selLabel = GRADES.find(g => g.key === selectedGrade)?.label || 'Standard'
  const myPriceSel = isMyPrice(it, selectedGrade, overrides)

  // Buy quantity + line total both flow from the shared helpers (single source
  // of truth); lineCostAtGrade already applies the standard-grade fallback.
  const buyQty = materialBuyQuantity(it)
  const lineTotal = lineCostAtGrade(it, selectedGrade)
  const unit = it.unit || ''
  const qtyNum = Number(it.quantity) || 0
  const coatsNum = coverage ? (Number(it.coats) || 1) : 1
  const overNum = Number(it.overage_pct) || 0

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '12px 8px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ItemVisual {...itemVisualProps(it, lookups)} size={44} />

        {/* Description */}
        <div style={{ flex: '2 1 200px', minWidth: 180 }}>
          <input style={{ ...cellInput, fontSize: 'var(--text-base)', fontWeight: 600 }} placeholder={t('materials:lineItems.descriptionPlaceholder')} value={it.description ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { description: e.target.value })} />
          {it.source_zone_name && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>{t('materials:lineItems.fromZone', { zone: it.source_zone_name })}</div>}
        </div>

        {/* Qty (unit inline) + Buys chip + Adjust toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <Stepper label={t('materials:lineItems.qty')} value={it.quantity} step={0.25} min={0} disabled={readOnly} onChange={v => onUpdate(it.id, { quantity: v })} />
            <input aria-label={t('materials:lineItems.unitAria')} placeholder={t('materials:lineItems.unitPlaceholder')} value={unit} disabled={readOnly}
              style={{ ...cellInput, width: 64, height: 28, padding: '6px 6px' }}
              onChange={e => onUpdate(it.id, { unit: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary, #26464c)', background: 'rgba(38,70,76,0.08)', borderRadius: 9999, padding: '2px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {t('materials:lineItems.buys', { qty: buyQty, unit: unit ? ` ${unit}` : '' })}
            </span>
            <button type="button" onClick={() => setAdjustOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #26464c)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              {adjustOpen ? t('materials:lineItems.hide') : t('materials:lineItems.adjust')}
            </button>
          </div>
        </div>

        {/* Selected grade — product + cost + All grades */}
        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ ...capsLabel, color: 'var(--color-primary, #26464c)' }}>{selLabel}</span>
            {myPriceSel && <span style={myPriceTag}>{t('materials:lineItems.myPrice')}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <input style={cellInput} placeholder={t('materials:lineItems.productPlaceholder')} value={it[`product_${selectedGrade}`] ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { [`product_${selectedGrade}`]: e.target.value })} />
            <input style={{ ...cellInput, fontVariantNumeric: 'tabular-nums' }} type="number" step="0.01" placeholder={t('materials:lineItems.costPlaceholder')} value={it[`cost_${selectedGrade}`] ?? ''} disabled={readOnly} onChange={e => onUpdate(it.id, { [`cost_${selectedGrade}`]: e.target.value })} />
          </div>
          <button type="button" onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #26464c)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 0 0' }}>
            {open ? t('materials:lineItems.hideGrades') : t('materials:lineItems.allGrades')}
          </button>
        </div>

        {/* Line total (right) + delete */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ textAlign: 'right', minWidth: 92 }}>
            <div style={capsLabel}>{t('materials:lineItems.lineTotal')}</div>
            <div style={{ marginTop: 2, fontSize: 'var(--text-base)', fontWeight: lineTotal > 0 ? 700 : 400, color: lineTotal > 0 ? 'var(--color-text, #1b2426)' : 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{money(lineTotal)}</div>
          </div>
          {!readOnly && (
            <button onClick={() => onRemove(it.id)} title={t('materials:lineItems.removeLine')} style={{ background: 'none', border: 'none', color: 'var(--color-danger, #dc2626)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px 2px' }}>×</button>
          )}
        </div>
      </div>

      {/* Adjust: coats (coverage only) + overage + the buy-quantity math */}
      {adjustOpen && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10, padding: '10px 8px', background: 'rgba(38,70,76,0.03)', borderRadius: 'var(--radius-sm)' }}>
          {coverage && (
            <Stepper label={t('materials:lineItems.coats')} value={it.coats} step={1} min={1} max={5} disabled={readOnly} title={t('materials:lineItems.coatsTitle')} onChange={v => onUpdate(it.id, { coats: v })} />
          )}
          <Stepper label={t('materials:lineItems.overagePct')} value={it.overage_pct} step={1} min={0} disabled={readOnly} onChange={v => onUpdate(it.id, { overage_pct: v })} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {qtyNum} × {coatsNum} × (1 + {overNum}%) = {buyQty}{unit ? ` ${unit}` : ''}
          </div>
        </div>
      )}

      {/* All grades detail */}
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 10 }}>
          {GRADES.map(g => (
            <GradeDetail key={g.key} it={it} gradeKey={g.key} label={g.label} readOnly={readOnly} overrides={overrides} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function MaterialLineItemsTable({ items, onUpdate, onRemove, readOnly = false, overrideMap, selectedGrade = 'standard', lookups, onGradeChange, onExportCsv, onSave, saving }) {
  const { t } = useTranslation()
  const overrides = overrideMap || new Map()

  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, padding: '16px 0' }}>
        {t('materials:lineItems.empty')}
      </p>
    )
  }

  // Group into real categories, preserving item order within each, and render
  // sections in the fixed CATEGORY_ORDER (Other Items last).
  const byCat = new Map()
  for (const it of items) {
    const slug = itemVisualProps(it, lookups).taxonomySlug
    const cat = categoryForSlug(slug)
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat).push(it)
  }
  const sections = CATEGORY_ORDER.filter(cat => byCat.has(cat)).map(cat => ({ category: cat, items: byCat.get(cat) }))

  const selLabel = GRADES.find(g => g.key === selectedGrade)?.label || 'Standard'

  return (
    <div>
      {sections.map(sec => (
        <div key={sec.category} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 8px', borderBottom: '2px solid rgba(38,70,76,0.16)' }}>
            <span style={capsLabel}>{t(`materials:lineItems.category.${CATEGORY_KEY[sec.category]}`)}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{t('materials:lineItems.itemCount', { count: sec.items.length })}</span>
          </div>
          {sec.items.map(it => (
            <LineRow key={it.id} it={it} selectedGrade={selectedGrade} readOnly={readOnly} overrides={overrides} lookups={lookups} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {t('materials:lineItems.sectionSubtotal', { amount: money(gradeTotal(sec.items, selectedGrade)) })}
          </div>
        </div>
      ))}

      {/* Sticky bottom summary bar */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 5, marginTop: 12,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 14px', borderTop: '1px solid var(--color-border)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
        background: 'var(--color-surface)', boxShadow: '0 -4px 16px rgba(27,36,38,0.10)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text, #1b2426)' }}>{t('materials:lineItems.itemsCount', { count: items.length })}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text, #1b2426)', fontVariantNumeric: 'tabular-nums' }}>
          {t('materials:summary.totalAt', { grade: selLabel, amount: money(gradeTotal(items, selectedGrade)) })}
        </span>

        {!readOnly && onGradeChange && (
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {GRADES.map(g => (
              <button key={g.key} type="button" onClick={() => onGradeChange(g.key)} style={gradePill(selectedGrade === g.key)}>{g.label}</button>
            ))}
          </span>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onExportCsv && <button type="button" onClick={onExportCsv} style={{ ...gradePill(false), fontWeight: 600 }}>{t('materials:summary.exportCsv')}</button>}
          {!readOnly && onSave && (
            <button type="button" onClick={onSave} disabled={saving} style={{
              padding: '8px 20px', borderRadius: 'var(--radius-md)', border: 'none', fontSize: 14, fontWeight: 700,
              background: 'linear-gradient(135deg, #F27243, #d95f33)', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            }}>{saving ? t('materials:summary.saving') : t('materials:summary.saveOrder')}</button>
          )}
        </span>
      </div>
    </div>
  )
}
